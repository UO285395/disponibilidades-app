$ErrorActionPreference='Stop'
$base='http://127.0.0.1:8001'
$ts=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

function PostJson($path,$body,$token=$null){
  $h=@{'Content-Type'='application/json'}
  if($token){$h['Authorization']="Bearer $token"}
  $json=$body|ConvertTo-Json -Depth 8
  return Invoke-RestMethod -Uri ($base+$path) -Method Post -Headers $h -Body $json
}
function GetJson($path,$token=$null){
  $h=@{}
  if($token){$h['Authorization']="Bearer $token"}
  return Invoke-RestMethod -Uri ($base+$path) -Method Get -Headers $h
}
function DelJson($path,$token=$null){
  $h=@{}
  if($token){$h['Authorization']="Bearer $token"}
  return Invoke-RestMethod -Uri ($base+$path) -Method Delete -Headers $h
}
function PutJson($path,$body,$token=$null){
  $h=@{'Content-Type'='application/json'}
  if($token){$h['Authorization']="Bearer $token"}
  $json=$body|ConvertTo-Json -Depth 8
  return Invoke-RestMethod -Uri ($base+$path) -Method Put -Headers $h -Body $json
}

$results=@()
function AddResult($area,$check,$ok,$detail){
  $script:results += [pscustomobject]@{area=$area;check=$check;ok=$ok;detail=$detail}
}

try { $open=Invoke-WebRequest -Uri "$base/openapi.json" -UseBasicParsing; AddResult 'infra' 'openapi reachable' ($open.StatusCode -eq 200) "status=$($open.StatusCode)" } catch { AddResult 'infra' 'openapi reachable' $false $_.Exception.Message }

$suEmail="smoke.super.$ts@a.test"
$aAdminEmail="smoke.adminA.$ts@a.test"
$bAdminEmail="smoke.adminB.$ts@b.test"
$bUserEmail="smoke.userB.$ts@b.test"

foreach($e in @($suEmail,$aAdminEmail,$bAdminEmail,$bUserEmail)){
  try { PostJson '/register' @{email=$e; full_name=$e; password='Pass1234!'} | Out-Null } catch {}
}

$suToken=(PostJson '/login' @{email=$suEmail; password='Pass1234!'}).access_token
$aAdminToken=(PostJson '/login' @{email=$aAdminEmail; password='Pass1234!'}).access_token
$bAdminToken=(PostJson '/login' @{email=$bAdminEmail; password='Pass1234!'}).access_token
$bUserToken=(PostJson '/login' @{email=$bUserEmail; password='Pass1234!'}).access_token

try { PostJson '/admin/become_superadmin' @{} $suToken | Out-Null; AddResult 'usuarios' 'become_superadmin' $true 'ok' } catch { AddResult 'usuarios' 'become_superadmin' $false $_.Exception.Message }
try { PostJson '/admin/become_admin' @{} $aAdminToken | Out-Null; AddResult 'usuarios' 'become_admin A' $true 'ok' } catch { AddResult 'usuarios' 'become_admin A' $false $_.Exception.Message }
try { PostJson '/admin/become_admin' @{} $bAdminToken | Out-Null; AddResult 'usuarios' 'become_admin B' $true 'ok' } catch { AddResult 'usuarios' 'become_admin B' $false $_.Exception.Message }

$policyId=$null
try {
  $p=PostJson '/admin/domain-policies' @{domain='a.test';events_enabled=$true;availabilities_enabled=$true;spaces_enabled=$true} $suToken
  $policyId=$p.id
  AddResult 'politicas' 'create policy' $true "id=$policyId"
} catch { AddResult 'politicas' 'create policy' $false $_.Exception.Message }
if($policyId){
  try { PutJson "/admin/domain-policies/$policyId" @{domain='a.test';events_enabled=$true;availabilities_enabled=$true;spaces_enabled=$true} $suToken | Out-Null; AddResult 'politicas' 'update policy' $true 'ok' } catch { AddResult 'politicas' 'update policy' $false $_.Exception.Message }
}

$eventId=$null
try {
  $ev=PostJson '/events' @{title='Smoke Event B';description='';date='2099-12-31';start_time='10:00:00';allowed_domain='b.test'} $aAdminToken
  $eventId=$ev.id
  AddResult 'eventos' 'create event with allowed_domain' $true "id=$eventId"
} catch { AddResult 'eventos' 'create event with allowed_domain' $false $_.Exception.Message }

if($eventId){
  try { GetJson "/events/$eventId" $aAdminToken | Out-Null; AddResult 'eventos' 'admin A cannot access B event' $false 'unexpected access allowed' } catch { AddResult 'eventos' 'admin A cannot access B event' ($_.Exception.Message -match '403') $_.Exception.Message }
  try { GetJson "/events/$eventId" $bAdminToken | Out-Null; AddResult 'eventos' 'admin B can access B event' $true 'ok' } catch { AddResult 'eventos' 'admin B can access B event' $false $_.Exception.Message }
}

if($eventId){
  try { PostJson "/events/$eventId/responses" @{answer='si';justification=$null} $bUserToken | Out-Null; AddResult 'eventos' 'first vote accepted' $true 'ok' } catch { AddResult 'eventos' 'first vote accepted' $false $_.Exception.Message }
  try { PostJson "/events/$eventId/responses" @{answer='no';justification='retry'} $bUserToken | Out-Null; AddResult 'eventos' 'second vote blocked' $false 'unexpected second vote accepted' } catch { AddResult 'eventos' 'second vote blocked' ($_.Exception.Message -match 'Ya has votado|400') $_.Exception.Message }
}

try {
  PostJson '/availability/my' @{date='2099-12-30';start_time='09:00:00';end_time='10:00:00'} $bUserToken | Out-Null
  $all=GetJson '/admin/availability' $bAdminToken
  $seen=($all | Where-Object { $_.email -eq $bUserEmail }).Count -gt 0
  AddResult 'disponibilidad' 'user slot visible in admin panel' $seen "found=$seen"
} catch { AddResult 'disponibilidad' 'user slot visible in admin panel' $false $_.Exception.Message }

$spaceId=$null
$reservationId=$null
try {
  $s=PostJson '/spaces' @{name="SmokeSpace-$ts";description='test'} $bAdminToken
  $spaceId=$s.id
  AddResult 'espacios' 'create space' $true "id=$spaceId"
} catch { AddResult 'espacios' 'create space' $false $_.Exception.Message }
if($spaceId){
  try {
    $r=PostJson '/reservations' @{space_id=$spaceId;date='2099-12-29';start_time='11:00';end_time='12:00';reason='smoke'} $bUserToken
    $reservationId=$r.id
    AddResult 'reservas' 'create reservation' $true "id=$reservationId"
  } catch { AddResult 'reservas' 'create reservation' $false $_.Exception.Message }
}
if($reservationId){
  try { DelJson "/reservations/$reservationId" $bUserToken | Out-Null; AddResult 'reservas' 'cancel own reservation' $true 'ok' } catch { AddResult 'reservas' 'cancel own reservation' $false $_.Exception.Message }
}

try {
  $us=GetJson '/admin/users' $suToken
  AddResult 'usuarios' 'superadmin list users' ($us.Count -ge 1) "count=$($us.Count)"
} catch { AddResult 'usuarios' 'superadmin list users' $false $_.Exception.Message }
try {
  $ua=GetJson '/admin/users' $aAdminToken
  $cross=($ua | Where-Object { $_.email -like '*@b.test' }).Count
  AddResult 'usuarios' 'admin scoped users by domain' ($cross -eq 0) "crossDomainCount=$cross"
} catch { AddResult 'usuarios' 'admin scoped users by domain' $false $_.Exception.Message }

$results | Sort-Object area,check | ConvertTo-Json -Depth 5
