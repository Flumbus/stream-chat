; Only an NSIS installation enables updates. Unpacked builds stay disabled.
!macro customInstall
  FileOpen $0 "$INSTDIR\resources\installed" w
  FileWrite $0 "StreamChat NSIS"
  FileClose $0
!macroend
