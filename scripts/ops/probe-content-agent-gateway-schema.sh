#!/usr/bin/env bash
# Registration-only PR touch: no probe behavior change.
set -euo pipefail
set +x

: "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"
: "${VERCEL_ORG_ID:?VERCEL_ORG_ID is required}"
: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID is required}"
: "${PROBE_KEY_NAME:?PROBE_KEY_NAME is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"

issue_url=$(gh issue create --repo "$GITHUB_REPOSITORY" \
  --title "AMS Gateway Schema Probe #${GITHUB_RUN_ID}" \
  --body "Sanitized AI Gateway key-response schema probe. The temporary key is uniquely named for this run, no secret values are reported, no model request is made, and only this run's temporary key may be deleted.")
issue_number=${issue_url##*/}

cleanup_probe_key() {
  original_rc=$?
  trap - EXIT
  set +e

  list_http=$(curl --max-time 15 --silent --show-error \
    --output /tmp/probe-keys.json --write-out '%{http_code}' \
    "https://api.vercel.com/v1/api-keys?teamId=${VERCEL_ORG_ID}&purpose=ai-gateway" \
    --header "Authorization: Bearer ${VERCEL_TOKEN}" || true)

  if [[ "$list_http" != "200" ]]; then
    gh issue comment "$issue_number" --repo "$GITHUB_REPOSITORY" \
      --body "Probe cleanup could not list Gateway keys (HTTP ${list_http}). No model request occurred."
    exit 91
  fi

  node <<'NODE' > /tmp/probe-delete-ids.txt
const fs=require('fs')
const j=JSON.parse(fs.readFileSync('/tmp/probe-keys.json','utf8'))
const list=Array.isArray(j)?j:(Array.isArray(j.apiKeys)?j.apiKeys:(Array.isArray(j.data)?j.data:[]))
const expectedName=process.env.PROBE_KEY_NAME
const expectedProject=process.env.VERCEL_PROJECT_ID
for(const k of list){
  if(!k || k.name!==expectedName) continue
  const projectId=k.projectId ?? k.project?.id ?? null
  if(projectId && projectId!==expectedProject) continue
  const id=k.id ?? k.keyId ?? k.apiKeyId
  if(typeof id==='string' && id) console.log(id)
}
NODE

  deleted=0
  failed=0
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    echo "::add-mask::$id" >&2
    code=$(curl --max-time 15 --silent --show-error \
      --output /dev/null --write-out '%{http_code}' \
      --request DELETE \
      "https://api.vercel.com/v1/api-keys/${id}?teamId=${VERCEL_ORG_ID}" \
      --header "Authorization: Bearer ${VERCEL_TOKEN}" || true)
    if [[ "$code" == "200" || "$code" == "204" ]]; then
      deleted=$((deleted+1))
    else
      failed=$((failed+1))
    fi
  done < /tmp/probe-delete-ids.txt

  gh issue comment "$issue_number" --repo "$GITHUB_REPOSITORY" \
    --body "Probe cleanup complete for this run's unique key only. Keys deleted: ${deleted}; deletion failures: ${failed}. No model request or customer charge occurred."

  if [[ "$failed" -ne 0 ]]; then
    exit 92
  fi
  exit "$original_rc"
}
trap cleanup_probe_key EXIT

node <<'NODE'
const fs=require('fs')
fs.writeFileSync('/tmp/probe-key-request.json',JSON.stringify({
  purpose:'ai-gateway',
  name:process.env.PROBE_KEY_NAME,
  projectId:process.env.VERCEL_PROJECT_ID,
  aiGatewayQuota:{limitAmount:1,refreshPeriod:'monthly'},
}))
NODE

create_http=$(curl --max-time 15 --silent --show-error \
  --output /tmp/probe-key-response.json --write-out '%{http_code}' \
  --request POST \
  "https://api.vercel.com/v1/api-keys?teamId=${VERCEL_ORG_ID}" \
  --header "Authorization: Bearer ${VERCEL_TOKEN}" \
  --header "Content-Type: application/json" \
  --data-binary @/tmp/probe-key-request.json || true)

if [[ "$create_http" != "200" && "$create_http" != "201" ]]; then
  gh issue comment "$issue_number" --repo "$GITHUB_REPOSITORY" \
    --body "Probe key creation failed with HTTP ${create_http:-transport-error}. No model request occurred."
  exit 21
fi

node <<'NODE' > /tmp/probe-schema.txt
const fs=require('fs')
const j=JSON.parse(fs.readFileSync('/tmp/probe-key-response.json','utf8'))
const rows=[]
const walk=(v,path)=>{
  if(v===null){rows.push(`${path}: null`);return}
  if(Array.isArray(v)){rows.push(`${path}: array(${v.length})`);v.forEach((x,i)=>walk(x,`${path}[${i}]`));return}
  if(typeof v==='object'){rows.push(`${path}: object`);for(const [k,x] of Object.entries(v))walk(x,`${path}.${k}`);return}
  if(typeof v==='string'){rows.push(`${path}: string(length=${v.length})`);return}
  rows.push(`${path}: ${typeof v}`)
}
walk(j,'response')
process.stdout.write(rows.join('\n'))
NODE

schema=$(cat /tmp/probe-schema.txt)
gh issue comment "$issue_number" --repo "$GITHUB_REPOSITORY" --body "Key creation HTTP=${create_http}. Sanitized response schema (field paths, data types, and string lengths only; no values):

\`\`\`
${schema}
\`\`\`"
