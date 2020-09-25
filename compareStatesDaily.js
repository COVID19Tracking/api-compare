const PUBLIC_API_BASE = "https://api.covidtracking.com/api/v1/"
const INTERNAL_API_BASE = "https://internalapi.covidtracking.com/api/v1/"
const ENDPOINTS = [
  // {name: "States Metadata",
  //  pubapi: PUBLIC_API_BASE+"states/info.json",
  //  internalapi: INTERNAL_API_BASE+"public/states/info",
  //  ignorekeys: new Set(["pui"]),
  //  embeddedkey: "state"}
    {name: "States Daily",
   pubapi: PUBLIC_API_BASE+"states/daily.json",
   internalapi: "https://github.com/COVID19Tracking/covid-public-api/blob/test/internal-endpoints/v1/states/daily.json?raw=true",
   ignorekeys: new Set(["hash", "totalTestResultsSource"])}
]

const fetch = require('node-fetch');
const changesets = require('diff-json');

let logOut = ""
const log = function(msg) {
  console.log(msg)
  logOut += msg
  logOut += "\n"
}

async function fetchEndpoint(url) {
  log(`Fetching ${url}`)
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}, url: ${url}`);
  } else {
    const resp = await response.json();
    return resp;
  }
}

const runCompare = async function(callback) {
  log('Running API comparison');
  ENDPOINTS.forEach(endpoint => {
    log("Comparing " + endpoint.name)
    log("Ignoring intentional differences in fields: "+ JSON.stringify(Array.from(endpoint.ignorekeys)))
    const promises = [fetchEndpoint(endpoint.pubapi), fetchEndpoint(endpoint.internalapi)]
    Promise.all(promises).then(results => {
      const pubapi = {children: results[0]};
      const internalapi = {children: results[1]};
      const diffOptions = endpoint.embeddedkey === undefined ? undefined : {children: endpoint.embeddedkey}
      const diffs = changesets.diff(pubapi, internalapi, diffOptions);

      if (diffs !== undefined && diffs.length > 0) {
        diffs.forEach(diff => {
          diff.changes.forEach((change, index) => {
            if (change.changes === undefined) return
            change.changes = change.changes.filter(subChange => {
              // filter out ignored keys
              if (endpoint.ignorekeys.has(subChange.key)) {
                return false
              }

              if (new Set(["lastUpdateEt", "dataQualityGrade"]).has(subChange.key)) {
                if ((subChange.type == "add" && subChange.value == null) ||
                  (subChange.type == "remove" && subChange.value == ""))
                return false;
              }

              // otherwise it's a real change. keep it
              return true
            })
            if (change.changes.length == 0) {
              diff.changes[index] = undefined
            }
          })
        })
        diffs[0].changes = diffs[0].changes.filter(elem => {
          return elem !== undefined
        })

        if (diffs[0].changes.length > 0) {
          log(`Found differences in ${endpoint.name}!!!`)
          log(JSON.stringify(diffs[0].changes, null, 2))
        } else {
          log(`No differences for ${endpoint.name}`)
        }
      }
      if (callback !== undefined) { callback(logOut) }
    })
  })
}

// standalone mode, run the thing
if (!module.parent) {
  runCompare()
}

module.exports = {
    runCompare: runCompare,
};