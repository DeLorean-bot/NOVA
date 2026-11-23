!ifndef BUILD_UNINSTALLER
  Var NovaSetupModule

  !macro customInstall
    ; Report completion to our setup window. Automatic updates keep their normal exit code.
    ${GetParameters} $R6
    ${GetOptions} $R6 "/nova-setup-ui" $R7
    ${IfNot} ${Errors}
      SetErrorLevel 73
    ${EndIf}
    ClearErrors
  !macroend

  !macro preInit
    ; The manual setup window starts the same EXE in silent mode for the actual install.
    ; Open it before NSIS takes its installation mutex so the silent child can take that lock.
    ${IfNot} ${Silent}
      !insertmacro check64BitAndSetRegView
      !insertmacro initMultiUser
      StrCpy $R4 0
      ${If} $installMode == "all"
        StrCpy $R4 1
      ${EndIf}

      !insertmacro setInstallModePerUser
      StrCpy $R5 $INSTDIR
      StrCpy $R6 ""
      ${If} ${UAC_IsAdmin}
        !insertmacro setInstallModePerAllUsers
        StrCpy $R6 $INSTDIR
      ${EndIf}

      InitPluginsDir
      File /oname=$PLUGINSDIR\nova-installer-ui.dll "${BUILD_RESOURCES_DIR}\nova-installer-ui.dll"
      File /oname=$PLUGINSDIR\nova-wordmark.png "${PROJECT_DIR}\docs\nova-wordmark-dark.png"
      System::Call 'kernel32::LoadLibraryW(w "$PLUGINSDIR\nova-installer-ui.dll") p.s'
      Pop $NovaSetupModule
      ${If} $NovaSetupModule == 0
        MessageBox MB_ICONSTOP "NOVA Setup could not start."
        SetErrorLevel 1
        Quit
      ${EndIf}

      System::Call 'kernel32::GetProcAddress(p $NovaSetupModule, m "NovaShowSetup") p.r0'
      StrCpy $R7 -1
      ${If} $0 != 0
        System::Call '::$0(w "$EXEPATH", w "${APP_FILENAME}", w R5, w R6, i $LANGUAGE, i R4, w "$PLUGINSDIR\nova-wordmark.png", w "${VERSION}", w .R8, i ${NSIS_MAX_STRLEN}) i.R7'
      ${EndIf}
      System::Call 'kernel32::FreeLibrary(p $NovaSetupModule)'

      ${If} $R7 == 1
      ${AndIf} $R8 != ""
        ${StdUtils.ExecShellAsUser} $0 "$R8" "open" ""
      ${EndIf}
      ${If} $R7 >= 0
        SetErrorLevel 0
      ${Else}
        SetErrorLevel 2
      ${EndIf}
      Quit
    ${EndIf}
  !macroend
!endif
