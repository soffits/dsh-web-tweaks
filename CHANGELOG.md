# Changelog

## 0.2.0

- File download: the card of a file the agent delivers now has its own short Download button, for every file type. It was in the preview header only, so a phone needed an extra tap and, on some files, a preview that could not open. (Published as 0.1.1 first; re-released as a minor bump because it adds a feature. The code is the same.)

## 0.1.1

- File download: the card of a file the agent delivers now has its own short Download button, for every file type. It was in the preview header only, so a phone needed an extra tap and, on some files, a preview that could not open.

## 0.1.0

- First release: dsh-custom-css, dsh-sidebar-split, dsh-file-download, dsh-subagent-model and @soffits/dsh-session-model as one plugin with one row (`web-tweaks`) and a switch per feature (`customCss`, `sidebarSplit`, `fileDownload`, `subagentModel`, `sessionModel`), all on by default. Custom CSS settings move under `customCss`; its routes, report folder and the sidebar split saved in each browser are unchanged. The browser half starts only the features that are on and follows a changed switch when the page comes back to the front.
