// Preferences

const loggingEnabled = true;
const loggingIndent = 4; // spaces
const snapToEdgeThreshold = 5; // logical pixels
const alwaysResize = true; // Always resize/maximize windows, even if they're already on the correct screen

// Key bindings

const enumerateKey = new Key('x', [ 'ctrl', 'shift', 'alt' ], enumerateAppWindows);
const moveKey = new Key('z', [ 'ctrl', 'shift', 'alt' ], () => moveBoundWindows(alwaysResize));

// Window bindings

const bindingSets = initBindingSets(); // Do not modify
const excludes = initExcludes(); // Do not modify

// If a binding exists for a screen or space that does not exist, the window will not be moved.
// bindingSet 'default' always exists and will be used if no other set matches.
// bindingSet(setName, [number_of_spaces_on_screen_0, number_of_spaces_on_screen_1, ...]);
// bind(setName, appId, screen, space, maximize [default = false]);
// If appId is '*', all windows except excluded windows will be moved to that screen and space.

exclude('net.antelle.keeweb'); // on all spaces of primary screen

bindingSet('workDocked', [1, 2, 3]);
// arrangement is laptop[2], vertical screen[1], horizontal screen[3]
// but spaces are labeled (5, 6) (1) (2, 3, 4) in the UI, for some reason

//bind('workDocked', 'google-play-music-desktop-player', 0, 0);
//bind('workDocked', 'com.apple.ActivityMonitor', 0, 0);
bind('workDocked', '*', 0, 0);

bind('workDocked', 'org.mozilla.firefox', 1, 0, true);
bind('workDocked', 'com.tinyspeck.slackmacgap', 1, 1);
bind('workDocked', 'com.apple.Notes', 1, 1);
bind('workDocked', 'com.apple.iCal', 1, 1);

bind('workDocked', 'com.postmanlabs.mac', 2, 0);
bind('workDocked', 'com.TechSmith.Snagit2018', 2, 0);
bind('workDocked', 'com.googlecode.iterm2', 2, 1, true);
bind('workDocked', 'com.jetbrains.intellij.ce', 2, 2, true);

bindingSet('undocked', [4]);

bind('undocked', 'com.tinyspeck.slackmacgap', 0, 0);
bind('undocked', 'com.apple.Notes', 0, 0);
bind('undocked', 'com.apple.iCal', 0, 0);

bind('undocked', 'org.mozilla.firefox', 0, 1, true);

bind('undocked', '*', 0, 2);

bind('undocked', 'com.googlecode.iterm2', 0, 3, true);

bind('undocked', 'com.jetbrains.intellij.ce', 0, 3, true);

//bindingSet('homeDocked', []); // TBD

// Logging

const indentString = _.repeat(' ', loggingIndent);

function noOp() {};

const log = loggingEnabled ?
  (...args) => { Phoenix.log(...args) } :
  noOp;

function _logIndent(level: number, message: string, ...args: any[]) {
  message = _.repeat(indentString, level) + message.toString();
  Phoenix.log(message, ...args);
}
const logIndent = loggingEnabled ? _logIndent : noOp;

// Frame management

function looseEquals(arg1: number, arg2: number, epsilon = 0.01) {
  return Math.abs(arg1 - arg2) <= epsilon;
}

const axes = {
  x: { start: 'left', end: 'right' },
  y: { start: 'top', end: 'bottom' }
};

function _reframe(windowFrame: Rectangle, oldScreenFrame: Rectangle, newScreenFrame: Rectangle, axis: string, size: string, newFrame: object) {
  const oldScreenFrameEnd = oldScreenFrame[axis] + oldScreenFrame[size];
  const newScreenFrameEnd = newScreenFrame[axis] + newScreenFrame[size];
  const windowEnd = windowFrame[axis] + windowFrame[size];
  const windowStartDelta = windowFrame[axis] - oldScreenFrame[axis];
  const windowEndDelta = windowEnd - oldScreenFrameEnd;
  logIndent(3, `startDelta: ${windowStartDelta}. endDelta: ${windowEndDelta}`);
  newFrame[size] = windowFrame[size];    // default: same as current size
  newFrame[axis] = newScreenFrame[axis]; // default: origin (top/left)

  if (windowFrame[size] > newScreenFrame[size]) {
    // Window is too large to fit on new screen. Shrink to fit.
    logIndent(3, `${axis}: Shrink`);
    newFrame[size] = newScreenFrame[size];
  }
  else if (looseEquals(windowFrame[size], oldScreenFrame[size], snapToEdgeThreshold)) {
    // Window was maximized. Keep window maximized
    logIndent(3, `${axis}: Maximize`);
    newFrame[size] = newScreenFrame[size];
  }
  else if (windowStartDelta >= snapToEdgeThreshold && windowEndDelta <= -snapToEdgeThreshold) {
    // Whole window was on old screen.
    // Position so the same relative amount of space is present on both sides before and after.
    logIndent(3, `${axis}: Position normally`);
    const scaleZ = (newScreenFrame[size] - windowFrame[size]) / (oldScreenFrame[size] - windowFrame[size]);
    newFrame[axis] = windowStartDelta * scaleZ + newScreenFrame[axis];
  }
  else if (Math.abs(windowStartDelta) <= snapToEdgeThreshold
        || windowEnd <= oldScreenFrame[axis]
        || windowStartDelta < 0 && windowEndDelta < 0) {
    logIndent(3, `${axis}: Flush ${axes[axis].start}`);
    // Flush start, or off of the screen towards the start.
    // Make flush start (default).
  }
  else if (Math.abs(windowEndDelta) <= snapToEdgeThreshold
        || windowFrame[axis] >= oldScreenFrameEnd
        || windowStartDelta > 0 && windowEndDelta > 0) {
    // Flush end, or off of the screen towards the end. Make flush end.
    logIndent(3, `${axis}: Flush ${axes[axis].end}`);
    newFrame[axis] = newScreenFrameEnd - windowFrame[size];
  }
  else if (windowStartDelta < 0 && windowEndDelta > 0) {
    // Window overflowed old screen on both sides, but will fit on new screen.
    // Center on new screen
    newFrame[axis] = newScreenFrame[axis] + (newScreenFrame[size] - windowFrame[size]) / 2.0;
    logIndent(3, `${axis}: Overflow`);
  }
  else {
    Phoenix.log(`Error: Could not determine placement of window on ${axis} axis! Defaulting to origin.`);
  }
}

function reframe(windowFrame: Rectangle, oldScreenFrame: Rectangle, newScreenFrame: Rectangle) {
  const newFrame : Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  logIndent(3, `Old screen: ${oldScreenFrame.x}, ${oldScreenFrame.y}, ${oldScreenFrame.x + oldScreenFrame.width}, ${oldScreenFrame.y + oldScreenFrame.height}`);
  logIndent(3, `New screen: ${newScreenFrame.x}, ${newScreenFrame.y}, ${newScreenFrame.x + newScreenFrame.width}, ${newScreenFrame.y + newScreenFrame.height}`);
  logIndent(3, `Old window: ${windowFrame.x}, ${windowFrame.y}, ${windowFrame.x + windowFrame.width}, ${windowFrame.y + windowFrame.height}`);
  _reframe(windowFrame, oldScreenFrame, newScreenFrame, 'x', 'width', newFrame);
  _reframe(windowFrame, oldScreenFrame, newScreenFrame, 'y', 'height', newFrame);
  logIndent(3, `New window: ${newFrame.x}, ${newFrame.y}, ${newFrame.x + newFrame.width}, ${newFrame.y + newFrame.height}`);
  return newFrame;
}

function resizeWindow(windowHandle: Window, fromScreenHandle: Screen, toScreenHandle: Screen, maximize = false) {
  const toScreenFrame = toScreenHandle.flippedVisibleFrame();
  const fromScreenFrame = fromScreenHandle.flippedVisibleFrame();
  const oldWindowFrame = windowHandle.frame();
  var newWindowFrame;
  if (maximize) {
    newWindowFrame = toScreenFrame;
  }
  else {
     newWindowFrame = reframe(oldWindowFrame, fromScreenFrame, toScreenFrame);
  }
  if (_.isEqual(oldWindowFrame, newWindowFrame)) {
    logIndent(3, 'New frame is same as old frame, not changing.');
  }
  else {
    if (maximize) {
      logIndent(3, 'Maximizing');
    }
    windowHandle.setFrame(newWindowFrame);
  }
}

function moveWindow(windowHandle: Window, fromSpace: Space, toSpace: Space) {
  fromSpace.removeWindows([windowHandle]);
  toSpace.addWindows([windowHandle]);
}

// Window binding

function bind(set: string, identifier: string, screen: number, space: number, maximize = false) {
  bindingSets[set].bindings[identifier] = { screen, space, maximize };
}

function unbind(set: string, identifier: string) {
  delete bindingSets[set].bindings[identifier];
}

function bindingSet(set: string, screenLayout: number[]) {
  bindingSets[set] = { screenLayout, bindings: {} };
}

function getCurrentBindingSetName(bindingSets, currentScreenLayout) {
  for (const bindingSet in bindingSets) {
    if (_.isEqual(currentScreenLayout, bindingSets[bindingSet].screenLayout)) {
      return bindingSet;
    }
  }
  return 'default';
}

function initBindingSets() {
  return { default: { screenLayout: [], bindings: {} } };
}

function getScreenSpaceLayout() {
  return Screen.all().map(screenHandle => screenHandle.spaces().length);
}

function initExcludes() {
  return { };
}

function exclude(appId: string) {
  excludes[appId] = true;
}
// Classes

/*
Class A represents a single binding, of a window to a screen and space, with optional arrangement properties (maximize, location)
Class B represents an arrangement of screens and spaces and the bindings that go with that arrangement
Class C represents the full set of all arrangements

A = WindowBinding
B = SpaceBinding
C = BindingSet

*/
/**
 * Data class
 * appId: String
 * screen: number
 * space: number
 * maximize: boolean
 */
class WindowBinding {
  appId: string;
  screen: number;
  space: number;
  maximize: boolean;
  constructor(appId: string, screen = 0, space = 0, maximize = false) {
    if (appId.constructor.name !== 'String' || appId === '') {
      throw new Error('appId must be a non-empty string');
    }
    this.appId = appId;
    this.screen = screen;
    this.space = space;
    this.maximize = maximize;
  }
}
/**
 * Represents an arrangement of screens and spaces and the bindings that go with that arrangement
 */
class SpaceBinding {
  _windowBindings: {};
  _name: string;
  constructor(name: string, space? : number[]) {
    this._windowBindings = {};
    this.screenSpaces = [];
    this._name = name;
    if (space !== undefined) {
      this.setScreenSpaces(space);
    }
  }
  add(windowBinding) : void {
    this._windowBindings[windowBinding.appId] = windowBinding;
  }
  remove(appId: string) : void {
    delete this._windowBindings[appId];
  }
  match(screenSpaces) : boolean {
    return _.isEqual(screenSpaces, this.screenSpaces);
  }
  setScreenSpaces(spaces: number[]) : void {
    this.screenSpaces = [...spaces];
  }
  set screenSpaces(spaces: number[]) {
    this.setScreenSpaces(spaces);
  }
  get screenSpaces() : number[] {
    return [...this.screenSpaces];
  }
  static get currentScreenSpaces() : number[] {
    return Screen.all().map(screenHandle => screenHandle.spaces().length);
  }
  get name() : string {
    return this._name;
  }
  set name(name: string) {
    this._name = name;
  }
  windowBinding(appId: string) : WindowBinding {
    return this._windowBindings[appId];
  }
}

/**
 * Represents the full set of all arrangements, including the default
 */
class BindingSet {
  _spaceBindings: { [name: string]: SpaceBinding };
  constructor() {
    this._spaceBindings = {};
    this.add(new SpaceBinding('default'));
  }
  add(spaceBinding: SpaceBinding) : void {
    this._spaceBindings[spaceBinding._name] = spaceBinding;
  }
  remove(name: string) : void {
    delete this._spaceBindings[name];
  }
  binding(name: string) : SpaceBinding {
    return this._spaceBindings[name];
  }
  match(screenSpaces: number[]) : string {
    for (const spaceBindingName in this._spaceBindings) {
      if (this._spaceBindings[spaceBindingName].match(screenSpaces)) {
        return spaceBindingName;
      }
    }
    return 'default';
  }
}
/**
 * Uses the data encapsulated in a BindingSet to manage the active user's active windows
 */
class WindowManager {
  _bindingSet: BindingSet;
  _excludes: { [appId: string]: boolean };
  constructor(bindingSet?: BindingSet) {
    this._excludes = {};
    this._bindingSet = bindingSet || new BindingSet();
  }
  static getScreenSpaceLayout() : number[] {
    return Screen.all().map(screenHandle => screenHandle.spaces().length);
  }
  exclude(appId: string, value = true) : void {
    this._excludes[appId] = value;
  }
  getActiveSpaceBindingName() : string {
    const currentLayout = WindowManager.getScreenSpaceLayout();
    return this._bindingSet.match(currentLayout);
  }
  getActiveSpaceBinding() : SpaceBinding {
    return this._bindingSet.binding(this.getActiveSpaceBindingName());
  }
  get bindingSet() : BindingSet {
    return this._bindingSet;
  }
  moveBoundWindows(alwaysResize = false) : void {
    log("Retrieving screens.");
    const screenHandles = Screen.all();
    //const screenSpaceLayout = getScreenSpaceLayout();
    //const bindingSetName = getCurrentBindingSetName(bindingSets, screenSpaceLayout);
    //const bindingSet = bindingSets[bindingSetName].bindings;
    const screenSpaceLayout = WindowManager.getScreenSpaceLayout();
    const spaceBinding = this.getActiveSpaceBinding();
    log(`Screen space layout: [${_.join(screenSpaceLayout, ', ')}]. Using binding set ${spaceBinding.name}.`);
    screenHandles.forEach((screenHandle, screen) => {
      log(`Screen ${screen}`);
      const spaceHandles = screenHandle.spaces();
      spaceHandles.forEach((spaceHandle, space) => {
        logIndent(1, `Space ${space}`);
        const windowHandles = spaceHandle.windows();
        windowHandles.forEach((windowHandle, window) => {
          const appId = windowHandle.app().bundleIdentifier();
          logIndent(2, `Window ${window}: "${appId}", "${windowHandle.title()}"`);
          const binding = spaceBinding.windowBinding(appId) || (this._excludes[appId] ? null : spaceBinding.windowBinding('*'));
          if (binding) {
            if (binding.screen !== screen || binding.space !== space) {
              const newScreenHandle = screenHandles[binding.screen];
              if (!newScreenHandle) {
                logIndent(3, `Destination screen ${binding.screen} does not exist, not moving.`);
                return;
              }
              const newSpaceHandle = newScreenHandle.spaces()[binding.space];
              if (!newSpaceHandle) {
                logIndent(3, `Destination space ${binding.space} on screen ${binding.screen} does not exist, not moving.`);
                return;
              }
              logIndent(3, `Moving from screen ${screen}, space ${space} to screen ${binding.screen}, space ${binding.space}`);
              moveWindow(
                windowHandle,
                spaceHandles[space],
                newSpaceHandle
              );
              resizeWindow(
                windowHandle,
                screenHandles[screen],
                newScreenHandle,
                binding.maximize
              );
            }
            else if (alwaysResize) {
              resizeWindow(
                windowHandle,
                screenHandles[screen],
                screenHandles[screen],
                binding.maximize
              );
            }
          }
        });
      });
    });
  }
}
// Actions

function enumerateAppWindows() {
  log('Retrieving screens');
  const screenHandles = Screen.all();
  const screens = { null: 'null' };
  screenHandles.forEach((screenHandle, index) => {
    screens[screenHandle.identifier()] = index;
    logIndent(1, `screen ${index} = screenID "${screenHandle.identifier()}"`);
  });
  log('Retrieving apps');
  const apps = App.all();
  apps.forEach((appHandle) => {
    const windows = appHandle.windows();
    // Skip apps with no windows
    if (windows.length > 0) {
      logIndent(1, `appId "${appHandle.bundleIdentifier()}" app "${appHandle.name()}" `);
      windows.forEach((windowHandle) => {
        const screenHandle = windowHandle.screen();
        const screenId = screenHandle ? screenHandle.identifier() : 'null';
        logIndent(2, `screen ${screens[screenId]} window "${windowHandle.title()}"`);
      });
    }
  });
}

function moveBoundWindows(alwaysResize = false) {
  log("Retrieving screens.");
  const screenHandles = Screen.all();
  const screenSpaceLayout = getScreenSpaceLayout();
  const bindingSetName = getCurrentBindingSetName(bindingSets, screenSpaceLayout);
  const bindingSet = bindingSets[bindingSetName].bindings;
  log(`Screen space layout: [${_.join(screenSpaceLayout, ', ')}]. Using binding set ${bindingSetName}.`);
  // log(screens);
  screenHandles.forEach((screenHandle, screen) => {
    log(`Screen ${screen}`);
    const spaceHandles = screenHandle.spaces();
    // log(spaces);
    spaceHandles.forEach((spaceHandle, space) => {
      logIndent(1, `Space ${space}`);
      const windowHandles = spaceHandle.windows();
      // log(windows);
      windowHandles.forEach((windowHandle, window) => {
        const appId = windowHandle.app().bundleIdentifier();
        logIndent(2, `Window ${window}: "${appId}", "${windowHandle.title()}"`);
        const binding = bindingSet[appId] || (excludes[appId] ? undefined : bindingSet['*']);
        if (binding) {
          if (binding.screen !== screen || binding.space !== space) {
            const newScreenHandle = screenHandles[binding.screen];
            if (!newScreenHandle) {
              logIndent(3, `Destination screen ${binding.screen} does not exist, not moving.`);
              return;
            }
            const newSpaceHandle = newScreenHandle.spaces()[binding.space];
            if (!newSpaceHandle) {
              logIndent(3, `Destination space ${binding.space} on screen ${binding.screen} does not exist, not moving.`);
              return;
            }
            logIndent(3, `Moving from screen ${screen}, space ${space} to screen ${binding.screen}, space ${binding.space}`);
            moveWindow(
              windowHandle,
              spaceHandles[space],
              newSpaceHandle
            );
            resizeWindow(
              windowHandle,
              screenHandles[screen],
              newScreenHandle,
              binding.maximize
            );
          }
          else if (alwaysResize) {
            resizeWindow(
              windowHandle,
              screenHandles[screen],
              screenHandles[screen],
              binding.maximize
            );
          }
        }
      });
    });
  });
}
