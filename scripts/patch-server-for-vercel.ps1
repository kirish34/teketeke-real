\
        Param(
          [string]$ServerFile = "server\server.js"
        )
        if (!(Test-Path $ServerFile)) {
          Write-Error "Cannot find $ServerFile. Run this from your project root or pass -ServerFile."
          exit 1
        }
        $code = Get-Content $ServerFile -Raw

        # ensure dotenv
        if ($code -notmatch "require\('dotenv'\)\.config") {
          $code = "require('dotenv').config();`n" + $code
        }

        # wrap app.listen with VERCEL guard; add module.exports = app
        if ($code -match "app\.listen\(") {
          $code = $code -replace "app\.listen\([^\)]*\);\s*", "const PORT = process.env.PORT || 5001;`nif (!process.env.VERCEL) {`n  app.listen(PORT, ()=>console.log('TekeTeke REAL API listening on '+PORT));`n}`n"
        } else {
          $code += "`nconst PORT = process.env.PORT || 5001;`nif (!process.env.VERCEL) {`n  app.listen(PORT, ()=>console.log('TekeTeke REAL API listening on '+PORT));`n}`n"
        }

        if ($code -notmatch "module\.exports\s*=\s*app") {
          $code += "`nmodule.exports = app;`n"
        }

        Set-Content -Path $ServerFile -Value $code -Encoding UTF8
        Write-Host "Patched $ServerFile for Vercel."
