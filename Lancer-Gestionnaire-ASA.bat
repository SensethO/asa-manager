@echo off
chcp 65001 >nul
title Gestionnaire de serveurs ASA
cd /d "%~dp0"

set "NODE=E:\NPX\node.exe"
set "NPM=E:\NPX\npm.cmd"
set "URL=http://localhost:8477"
set "SONDE=http://127.0.0.1:8477"

echo.
echo   Gestionnaire de serveurs ASA
echo   ----------------------------
echo.

rem Ce fichier doit rester en ASCII pur et en fins de ligne CRLF : cmd decoupe
rem mal les lignes autrement, et executait alors les commentaires comme des
rem commandes tout en tronquant les set.

rem Un gestionnaire deja en ecoute : on ouvre la page plutot que d'en lancer un
rem second, qui echouerait sur un port occupe. Deux filtres successifs plutot
rem qu'une expression reguliere : combiner /R et /C: fait traiter le motif comme
rem une chaine litterale, et la detection ne correspondait alors jamais.
netstat -ano | findstr ":8477" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo   Le gestionnaire tourne deja. Ouverture de la page...
    start "" "%URL%"
    exit /b 0
)

if not exist "%NODE%" (
    echo   ERREUR : Node est introuvable a l'emplacement attendu :
    echo   %NODE%
    echo.
    pause
    exit /b 1
)

rem L'interface compilee peut manquer apres une recuperation du code
if not exist "dist\server\src\index.js" (
    echo   Premiere construction, patientez une minute...
    call "%NPM%" run build
    if errorlevel 1 (
        echo.
        echo   ERREUR : la construction a echoue.
        pause
        exit /b 1
    )
)

rem La page n'est ouverte qu'une fois le service pret : l'ouvrir tout de suite
rem afficherait une erreur de connexion le temps du demarrage.
rem La sonde interroge 127.0.0.1 car "localhost" se resout d'abord en IPv6 "::1",
rem sur lequel le service n'ecoute pas, ce qui ralentit chaque essai. Le
rem navigateur ouvre "localhost" : changer d'origine deconnecterait les
rem sessions deja ouvertes.
start "" /min powershell -NoProfile -Command "for($i=0;$i -lt 90;$i++){ try{ Invoke-WebRequest '%SONDE%' -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process '%URL%'; break }catch{ Start-Sleep -Milliseconds 500 } }"

echo   Demarrage... la page s'ouvrira toute seule.
echo.
echo   Gardez cette fenetre ouverte : la fermer arrete le gestionnaire.
echo   Le serveur ARK, lui, continue de tourner et sera repris au prochain lancement.
echo.

"%NODE%" dist\server\src\index.js

echo.
echo   Le gestionnaire s'est arrete.
pause
