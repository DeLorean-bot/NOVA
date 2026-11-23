@echo off
setlocal
rem Run from a Visual Studio x86 Native Tools Command Prompt.
pushd "%~dp0"
cl.exe /nologo /LD /MT /O2 /W4 /WX /utf-8 /std:c++17 /EHsc /DUNICODE /D_UNICODE /Fo"%TEMP%\nova-installer-ui.obj" /Fe"nova-installer-ui.dll" installer-ui.cpp /link user32.lib gdi32.lib gdiplus.lib dwmapi.lib ole32.lib shell32.lib shlwapi.lib uuid.lib /IMPLIB:"%TEMP%\nova-installer-ui.lib"
set "novaInstallerCompileExit=%errorlevel%"
popd
exit /b %novaInstallerCompileExit%
