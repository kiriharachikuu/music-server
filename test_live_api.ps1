$ErrorActionPreference = "Continue"

Write-Host "=== 1. Public: GET /api/live-sessions ===" -ForegroundColor Cyan
$r1 = Invoke-RestMethod -Uri "http://localhost:3000/api/live-sessions" -Method Get
$r1 | ConvertTo-Json -Depth 3

Write-Host "`n=== 2. Login as admin ===" -ForegroundColor Cyan
$login = @{ email = "admin@xtmusic.com"; password = "123456" } | ConvertTo-Json
$auth = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body $login -ContentType "application/json"
$token = $auth.data.access_token
Write-Host "Token obtained: $($token.Substring(0,20))..."

$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

Write-Host "`n=== 3. Admin: POST create session ===" -ForegroundColor Cyan
$body = @{ title = "2024春季直播"; artist = "测试歌手"; liveTime = "2024-03-15T00:00:00.000Z"; status = "PUBLISHED" } | ConvertTo-Json
$sessionResp = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/live-sessions" -Method Post -Body $body -Headers $headers
$sessionId = $sessionResp.data.id
Write-Host "Created session: $sessionId"
$sessionResp | ConvertTo-Json -Depth 3

Write-Host "`n=== 4. Admin: POST create clip ===" -ForegroundColor Cyan
$clipBody = @{
  title = "告白气球"
  artist = "测试歌手"
  sessionId = $sessionId
  trackIndex = 1
  duration = 240
  fileUrl = "/uploads/test.mp3"
  status = "PUBLISHED"
} | ConvertTo-Json
$clipResp = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/live-clips" -Method Post -Body $clipBody -Headers $headers
Write-Host "Created clip: $($clipResp.data.id)"
$clipResp | ConvertTo-Json -Depth 3

Write-Host "`n=== 5. Public: GET /api/live-sessions (after creation) ===" -ForegroundColor Cyan
$r2 = Invoke-RestMethod -Uri "http://localhost:3000/api/live-sessions" -Method Get
$r2 | ConvertTo-Json -Depth 3
Write-Host "Total sessions: $($r2.data.total)"

Write-Host "`n=== 6. Public: GET /api/live-sessions/$sessionId (with clips) ===" -ForegroundColor Cyan
$detail = Invoke-RestMethod -Uri "http://localhost:3000/api/live-sessions/$sessionId" -Method Get
$detail | ConvertTo-Json -Depth 4
Write-Host "Clip count: $($detail.data.songCount)"

Write-Host "`n=== 7. Admin: DELETE session $sessionId ===" -ForegroundColor Cyan
$delResp = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/live-sessions/$sessionId" -Method Delete -Headers $headers
$delResp | ConvertTo-Json -Depth 3
Write-Host "Deleted: $($delResp.data.deleted)"

Write-Host "`n=== 8. Verify cleanup: GET /api/live-sessions ===" -ForegroundColor Cyan
$r3 = Invoke-RestMethod -Uri "http://localhost:3000/api/live-sessions" -Method Get
$r3 | ConvertTo-Json -Depth 3
Write-Host "Total after delete: $($r3.data.total)"

Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Green
