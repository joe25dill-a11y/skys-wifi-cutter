!macro customInstall
  ; Install bundled Npcap if no packet capture driver is present (Npcap or legacy WinPcap).
  IfFileExists "$SYSDIR\Npcap\wpcap.dll" npcap_done 0
  IfFileExists "$SYSDIR\wpcap.dll" npcap_done 0
  IfFileExists "$SYSDIR\Packet.dll" npcap_done 0
    IfFileExists "$INSTDIR\resources\npcap\npcap-installer.exe" 0 npcap_done
      DetailPrint "Installing Npcap (required for cut/block)..."
      ExecWait '"$INSTDIR\resources\npcap\npcap-installer.exe" /S /winpcap_mode=yes /loopback_support=yes /admin_only=no' $0
      ${If} $0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "Npcap could not be installed automatically (code $0).$\n$\nCut/block may not work until Npcap is installed."
      ${EndIf}
  npcap_done:
!macroend

!macro customUnInstall
  DetailPrint "Stopping Skys WiFi Cutter and cleaning up..."
  ; Kill main app (tray keeps it running after close — this unlocks install files)
  nsExec::ExecToLog 'taskkill /F /IM "Skys WiFi Cutter.exe" /T'
  Sleep 1000
  nsExec::ExecToLog 'taskkill /F /IM SkysNativeMeter.exe /T'
  IfFileExists "$INSTDIR\resources\app.asar.unpacked\scripts\uninstall-cleanup.ps1" 0 cleanup_done
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\app.asar.unpacked\scripts\uninstall-cleanup.ps1"'
  cleanup_done:
!macroend
