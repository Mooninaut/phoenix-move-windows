# Phoenix Move Windows
Clement Cherlin's personal [Phoenix](https://github.com/kasper/phoenix) configuration script, written in TypeScript. Requires Phoenix to use.

macOS has an irritating habit of randomly rearranging Spaces and windows when connecting or disconnecting external monitors.

To correct this problem, `phoenix-move-windows`  moves windows to the screens and spaces that you have configured when you press `Ctrl-Shift-Alt-Z`. To assist in configuration, it lists all visible open windows and their internal identifiers in the Console when you press `Ctrl-Shift-Alt-X`. Both keybindings are configurable.

## Installation

To install Typescript typings for Phoenix, execute `npx typings install github:mafredri/phoenix-typings --save` from the `phoenix-move-windows` directory.

Execute `npm run type-check` to check for TypeScript errors.

Execute `npm run build` to build `lib/phoenix-config.js`.

Symlink or copy `lib/phoenix-config.js` to `~/.config/phoenix/phoenix.js` so Phoenix can find the generated configuration file.

## Configuration

Open `src/phoenix-config.ts` in your preferred text editor.

Search for `// Preferences`

`loggingEnabled` and `loggingIndent` control output to the macOS Console. To view Console output, open the Console app, enter `phoenix` in the search field, press Enter, click `ANY` and select `PROCESS`. Enabling console logging can help debug configuration issues.

To customize your personal configuration, edit the Window Bindings section.

The `enumerateAppWindows` binding will help you determine the internal IDs of your apps, and the internal numbering of your screens and spaces.

Due to limitations of the Spaces API, windows on non-visible Spaces will not be listed by `enumerateAppWindows`, and will not be moved by `moveBoundWindows`. Apple has not created a fully-featured public Spaces API.

`windowManager.exclude('app.id')` will prevent `moveBoundWindows` from moving any window belonging to the specified app. I recommend excluding any app that is assigned to All Desktops.

`phoenix-move-windows` uses the current arrangement of your screens and spaces to determine which set of bindings to choose from. Disconnecting or connecting external monitors changes the arrangement, allowing a single hotkey to automatically perform the correct arrangement. You may find that macOS moves spaces between monitors. You will have to manually correct that before pressing the hotkey.

`const bindingVariable = new SpaceBinding('bindingName', [x, y, z])` creates a new set of bindings. The `[x, y, z]` parameter specifies the logical (not physical) arrangement of screens and spaces to match on. Example: `[1, 2, 3]` will match if your primary screen has 1 space, your second screen has 2 spaces, and your third screen has 3 spaces. If you use multiple monitors but not additional spaces, `[1, 1]` will match 2 monitors with 1 space each. `[4]` will match 1 monitor with 4 spaces.

`windowManager.bindingSet.add(bindingVariable)` registers and activates the SpaceBinding.

`bindingVariable.add(new WindowBinding('app.id', screenNumber, spaceNumber))` binds all windows belonging to the specified app to the specified space on the specified screen.

`bindingVariable.add(new WindowBinding('*', screenNumber, spaceNumber))` creates a default binding that applies to all apps that do not have their own bindings set. You do not have to set a default binding.

`bindingVariable.add(new WindowBinding('app.id', screenNumber, spaceNumber, WindowBinding.maximize))` automatically resizes the window to fill all available space on the destination screen. It does not put an app in "fullscreen" mode, which actually creates an additional Space. It merely makes the app fill the screen (without overlapping the Dock or menu bar).

To set a custom window size, use an argument of the form `{ x: percent, y: percent, width: percent, height: percent }`. `WindowBinding.maximize` is simply a pre-defined value of `{ x: 0, y: 0, width: 100, height: 100 }`. The origin is the top-left corner of the screen. Positive x is to the right, positive y is towards the bottom. The specified app's window(s) will be resized to the given dimensions. Example: To fill the left half of the screen, use `{ x: 0, y:0, width: 50, height: 100 }`. The percentages will be scaled by the size of the screen, so `100` will always fill all available space.

# Limitations

`phoenix-move-windows` does not currently detect or distinguish between different arrangements of screens if the number and distribution of spaces is identical between them.

`phoenix-move-windows` does not currently distinguish between different windows belonging to the same app. All such windows will be moved to the same screen, and if an explicit window size argument is given, will be moved and resized identically. If this is not desirable, the app can be excluded and managed manually.

# Thanks

Thanks to Kasper Hirvikoski ([@kasper](https://github.com/kasper/)) and Jason Milkins ([@jasonm23](https://github.com/jasonm23/)) for maintaining [Phoenix](https://github.com/kasper/phoenix)!

# License
Released under the MIT License. See [LICENSE.txt](LICENSE.txt).
