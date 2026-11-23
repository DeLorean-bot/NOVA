!define NOVA_HEADER "141417"
!define MUI_BGCOLOR "${NOVA_HEADER}"
!define MUI_TEXTCOLOR "F2F2F4"
SetFont "Segoe UI" 9
Var NovaThemeModule
!ifdef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.NovaInstallerGui
!else
  !define MUI_CUSTOMFUNCTION_GUIINIT NovaInstallerGui
  !define MUI_DIRECTORYPAGE_TEXT_TOP "$(NovaDirectoryText)"

  LangString NovaDirectoryText 1033 "NOVA will be installed in this folder. Select Browse to choose another location."
  LangString NovaDirectoryText 1049 "NOVA будет установлена в эту папку. Нажмите «Обзор», чтобы выбрать другую."

  ; Keep the native installation progress control and use NOVA's accent color.
  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW NovaInstallationProgress
  !macroend

  LangString NovaFinishTitle 1033 "NOVA is ready"
  LangString NovaFinishTitle 1049 "NOVA готова"
  LangString NovaFinishText 1033 "Open NOVA now or find it later in the Start menu."
  LangString NovaFinishText 1049 "Откройте NOVA сейчас или позже через меню «Пуск»."
  LangString NovaOpenApp 1033 "Open NOVA"
  LangString NovaOpenApp 1049 "Открыть NOVA"

  !macro customFinishPage
    !define MUI_FINISHPAGE_TITLE "$(NovaFinishTitle)"
    !define MUI_FINISHPAGE_TEXT "$(NovaFinishText)"
    !ifndef HIDE_RUN_AFTER_FINISH
      !define MUI_FINISHPAGE_RUN
      !define MUI_FINISHPAGE_RUN_TEXT "$(NovaOpenApp)"
      !define MUI_FINISHPAGE_RUN_FUNCTION "NovaOpenInstalledApp"
    !endif
    !insertmacro MUI_PAGE_FINISH
  !macroend
!endif

!macro customHeader
  BrandingText " "
  !ifdef BUILD_UNINSTALLER
    Function un.NovaInstallerGui
  !else
    Function NovaInstallerGui
  !endif
      SetCtlColors $mui.Header.Background "" "${NOVA_HEADER}"
      SetCtlColors $mui.Header.Text "F2F2F4" "${NOVA_HEADER}"
      SetCtlColors $mui.Header.SubText "B8B8C0" "${NOVA_HEADER}"

      InitPluginsDir
      File /oname=$PLUGINSDIR\nova-installer-theme.dll "${BUILD_RESOURCES_DIR}\nova-installer-theme.dll"
      System::Call 'kernel32::LoadLibraryW(w "$PLUGINSDIR\nova-installer-theme.dll") p.s'
      Pop $NovaThemeModule
      ${If} $NovaThemeModule != 0
        System::Call 'kernel32::GetProcAddress(p $NovaThemeModule, m "NovaApplyTheme") p.r0'
        ${If} $0 != 0
          System::Call '::$0(p $HWNDPARENT)'
        ${EndIf}
      ${EndIf}

      ; Windows 11 supports custom caption colors. Older versions keep their system caption.
      System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 35, *i 0x171414, i 4)'
      System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 36, *i 0xF4F2F2, i 4)'
    FunctionEnd

  !ifdef BUILD_UNINSTALLER
    Function un.onGUIEnd
  !else
    Function .onGUIEnd
  !endif
      ${If} $NovaThemeModule != 0
        System::Call 'kernel32::FreeLibrary(p $NovaThemeModule)'
      ${EndIf}
    FunctionEnd

  !ifndef BUILD_UNINSTALLER
    Function NovaInstallationProgress
      FindWindow $0 "#32770" "" $HWNDPARENT
      FindWindow $0 "msctls_progress32" "" $0
      ${If} $0 != 0
        System::Call 'uxtheme::SetWindowTheme(p r0, w "", w "")'
        SendMessage $0 ${PBM_SETBARCOLOR} 0 0xFF7D4E
        SendMessage $0 ${PBM_SETBKCOLOR} 0 0x282222
      ${EndIf}
    FunctionEnd

    Function NovaOpenInstalledApp
      ${If} ${isUpdated}
        StrCpy $1 "--updated"
      ${Else}
        StrCpy $1 ""
      ${EndIf}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd
  !endif
!macroend
