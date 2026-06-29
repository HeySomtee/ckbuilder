$ts = [int][double]::Parse((Get-Date -UFormat %s))
$body = "{`"name`":`"Streak Viewer`",`"email`":`"streak-viewer-$ts@example.com`",`"password`":`"ViewerPass123`"}"

Write-Host "Registering throwaway account..." -ForegroundColor Cyan
$reg = Invoke-RestMethod -Uri 'https://worldcup26.ir/auth/register' -Method POST -Body $body -ContentType 'application/json' -TimeoutSec 25
$token = $reg.token
Write-Host ("JWT (first 30 chars): " + $token.Substring(0, 30) + "...`n") -ForegroundColor Green

$hdr = @{ Authorization = "Bearer $token" }

Write-Host "=== /get/teams (first 2 of 48) ===" -ForegroundColor Yellow
(Invoke-RestMethod -Uri 'https://worldcup26.ir/get/teams' -Headers $hdr -TimeoutSec 25) | Select-Object -First 2 | ConvertTo-Json -Depth 4

Write-Host "`n=== /get/groups (just group A) ===" -ForegroundColor Yellow
(Invoke-RestMethod -Uri 'https://worldcup26.ir/get/groups' -Headers $hdr -TimeoutSec 25) | Where-Object { $_.group -eq 'A' } | ConvertTo-Json -Depth 5

Write-Host "`n=== /get/stadiums (first 1 of 16) ===" -ForegroundColor Yellow
(Invoke-RestMethod -Uri 'https://worldcup26.ir/get/stadiums' -Headers $hdr -TimeoutSec 25) | Select-Object -First 1 | ConvertTo-Json -Depth 4

Write-Host "`n=== /get/games (1 finished, 1 upcoming, of 104) ===" -ForegroundColor Yellow
$games = (Invoke-RestMethod -Uri 'https://worldcup26.ir/get/games' -Headers $hdr -TimeoutSec 25).games
$games | Where-Object { $_.finished -eq 'TRUE' } | Select-Object -First 1 | ConvertTo-Json -Depth 4
$games | Where-Object { $_.finished -ne 'TRUE' } | Select-Object -First 1 | ConvertTo-Json -Depth 4

Write-Host "`nTotal: $($games.Count) games" -ForegroundColor Green
Write-Host "Finished: $(($games | Where-Object { $_.finished -eq 'TRUE' }).Count)" -ForegroundColor Green
