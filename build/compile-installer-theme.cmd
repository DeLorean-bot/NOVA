@echo off
setlocal
rem Run from a Visual Studio x86 Native Tools Command Prompt.
pushd "%~dp0"
cl.exe /nologo /LD /MT /O2 /W4 /WX /DUNICODE /D_UNICODE /Fo"%TEMP%\nova-installer-theme.obj" /Fe"nova-installer-theme.dll" installer-theme.c /link user32.lib gdi32.lib uxtheme.lib comctl32.lib /IMPLIB:"%TEMP%\nova-installer-theme.lib"
set "novaInstallerCompileExit=%errorlevel%"
popd
exit /b %novaInstallerCompileExit%
