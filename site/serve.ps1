$siteRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $siteRoot

Write-Host "Démarrage du CV full-stack sur http://localhost:3000/"
Write-Host "Administration : http://localhost:3000/admin"
Write-Host "Appuyez sur Ctrl+C pour arrêter."

npm run dev
