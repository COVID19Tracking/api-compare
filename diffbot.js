const fetch = require('node-fetch');
const { DateTime } = require('luxon');
const metadataCompare = require('./compareStatesInfo.js')
const statesDailyCompare = require('./compareStatesDaily.js')
const { WebClient } = require('@slack/web-api');

// compare public sheets
fetchPublicSheetCompare().then(pubSheetResults => {
  let publicSheetOutput = `Public sheet comparison: ${pubSheetResults}\n`

  // compare state metadata
  metadataCompare.runCompare(metadataCompareResults => {
    // compare states daily
    let statesDailyOutput = "Comparing states daily: https://internal.covidtracking.com/compare\n"
    fetchStatesDailyCompare().then(results =>{
      let statesDailyCompareResults = Compare(results)
      statesDailyOutput += `States daily comparison:  ${statesDailyCompareResults.length} differences found\n`

      statesDailyCompare.runCompare(sd2CompareResults => {
        const output = publicSheetOutput + "\n" + metadataCompareResults + "\n" + statesDailyOutput + "\n" + sd2CompareResults.substring(0,7000);
        postToSlack(output)
      })
    })
  })
})


async function fetchPublicSheetCompare() {
  const sheetCompare = await fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vTnhZb977UtXfzJbaQsy4Hhq37IqV1NjLEuFljgMCuI1Ep9CNCXhnluaplc704j_uQt22wqw7nlufJ8/pub?gid=992884448&single=true&output=csv")
  if (!sheetCompare.ok) {
    throw new Error(`HTTP error! status: ${sheetCompare.status}`);
  }
  return sheetCompare.text()
}


async function fetchStatesDailyCompare() {
  let pubApi = await fetch("https://api.covidtracking.com/v1/states/daily.json")
  if (!pubApi.ok) {
    throw new Error(`HTTP error! status: ${pubApi.status}`);
  }
  let pubApiJson = await pubApi.json()
  let internalApi = await fetch("https://internal.covidtracking.com/api-preview/states/daily")
  if (!internalApi.ok) {
    throw new Error(`HTTP error! status: ${internalApi.status}`);
  }
  let internalApiJson = await internalApi.json()
  return {current: pubApiJson, preview: internalApiJson}
}

// copied straight out of https://github.com/COVID19Tracking/website-internal/blob/master/pages/compare.js
const Compare = ({ preview, current }) => {
  const results = []
  const columns = [
    {
      title: 'Error',
      dataIndex: 'error',
      key: 'error',
      width: 150,
    },
  ]

  const dataSource = []
  current.forEach((row) => {
    const previewRow = preview.find(
      (p) =>
        p.state === row.state &&
        DateTime.fromISO(p.date).equals(DateTime.fromISO(row.date)),
    )
    if (!previewRow) {
      dataSource.push({
        error: 'Does not exist in preview',
        ...row,
      })
    } else {
      const unmatchedFields = []
      const fields = {}
      const merged = {}
      Object.keys(row).forEach((key) => {
        merged[key] = `${row[key]} - ${previewRow[key]}`
        if (key === 'date' || key === 'dateChecked' || key === 'lastUpdateEt') {
          return
        }
        if (
          !(row[key] === null && !previewRow[key]) &&
          row[key] !== previewRow[key] &&
          typeof previewRow[key] !== 'undefined'
        ) {
          unmatchedFields.push(key)
        }
      })
      if (unmatchedFields.length) {
        dataSource.push({
          error: unmatchedFields.join(', '),
          ...merged,
        })
      }
    }
  })
  Object.keys(current[0]).forEach((key) => {
    columns.push({
      title: key,
      dataIndex: key,
      key,
      width: 150,
    })
  })
  return dataSource
}

function postToSlack(message) {
  console.log(message)
  const web = new WebClient(process.env.SLACK_TOKEN);

  const result = web.files.upload({
    channels: process.env.SLACK_CHANNEL,
    file: Buffer.from(message, 'utf-8'),
    filetype: 'text'
  }).then(result => {
    console.log(result)
  })
}