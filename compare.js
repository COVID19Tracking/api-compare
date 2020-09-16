const PUBLIC_API_BASE = "https://api.covidtracking.com/api/v1/"
const INTERNAL_API_BASE = "https://internalapi.covidtracking.com/api/v1/"
const ENDPOINTS = [
  {name: "States Metadata",
   pubapi: PUBLIC_API_BASE+"states/info.json",
   internalapi: INTERNAL_API_BASE+"public/states/info",
   ignorekeys: new Set(["pui"]),
   embeddedkey: "state"}
]

const fetch = require('node-fetch');
var changesets = require('diff-json');

console.log('Running API comparison');

async function fetchEndpoint(url) {
  console.log(`Fetching ${url}`)
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}, url: ${url}`);
  } else {
    const resp = await response.json();
    return resp;
  }
}

ENDPOINTS.forEach(endpoint => {
  console.log("Comparing " + endpoint.name)
  console.log("Ignoring intentional differences in fields: ", endpoint.ignorekeys)
  const promises = [fetchEndpoint(endpoint.pubapi), fetchEndpoint(endpoint.internalapi)]
  Promise.all(promises).then(results => {
    const pubapi = {children: results[0]};
    const internalapi = {children: results[1]};
    const diffs = changesets.diff(pubapi, internalapi, {children: endpoint.embeddedkey});

    if (diffs !== undefined && diffs.length > 0) {
      diffs.forEach(diff => {
        diff.changes.forEach((change, index) => {
          change.changes = change.changes.filter(subChange => {
            // filter out ignored keys
            if (endpoint.ignorekeys.has(subChange.key)) {
              return false
            }
            // filter out fields that are intentionally blank in the internal API and are empty strings
            if (subChange.type == "remove" && subChange.value == "") {
              return false
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
        console.log(`Found differences in ${endpoint.name}!!!`)
        console.log(JSON.stringify(diffs[0].changes, null, 2))
      } else {
        console.log(`No differences for ${endpoint.name}`)
      }
    }
  })
})

