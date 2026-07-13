# Twitter/X Block Manager

A lightweight browser extension to export blocked account lists and execute bulk actions (Block, Unblock, Mute, Unmute, Follow, and Unfollow) using active web client sessions.

---

## Features

- **Export/Import**: Export and import lists using **.TXT** (handles) and **.CSV** (display names, handles, bios, and IDs).
- **Followers/Following Fetcher**: Retrieve and load the followers or following lists of any public account directly from the Twitter/X API (capped at 1000 users).
- **Whitelist**: Checkboxes to skip accounts you follow or accounts that follow you.
- **Smart Skipping**: Local caching automatically skips users who are already blocked, muted, followed, or unfollowed.
- **100% Local & Private**: All verification checks and API requests run directly inside your browser tab using your active session. No account credentials or details are ever sent to external databases.

---

## Installation (Developer Mode)

To run this extension locally:

1. Clone or download this repository.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Toggle the **Developer mode** switch in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the root folder containing the extension files.

---

## License

This project is open-source and licensed under the [Apache License 2.0](LICENSE).
