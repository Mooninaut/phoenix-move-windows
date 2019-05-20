const axes = {
  x: { start: 'left', end: 'right' },
  y: { start: 'top', end: 'bottom' }
};

function looseEquals(arg1: number, arg2: number, epsilon = 0.01) {
  return Math.abs(arg1 - arg2) <= epsilon;
}
// Classes

class Logger {
  _enabled: boolean;
  _indent: number;
  _indentString: string;
  constructor(loggingEnabled = true, indent = 4) {
    this._enabled = loggingEnabled;
    this.setIndent(indent);
  }
  setIndent(indent: number) {
    this._indent = indent;
    // @ts-ignore
    this._indentString = _.repeat(' ', indent);
  }
  log(...output: any[]) : void {
    if (this._enabled) {
      Phoenix.log(...output);
    }
  }
  logIndent(level: number, message: string, ...output: any[]) : void {
    if (this._enabled) {
      // @ts-ignore
      message = _.repeat(this._indentString, level) + message.toString();
      Phoenix.log(message, ...output);
    }
  }
  set enabled(value: boolean) {
    this._enabled = value;
  }
  get enabled() : boolean {
    return this._enabled
  }
}

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
  frame: Rectangle;
  constructor(appId: string, screen = 0, space = 0, frame?: Rectangle) {
    if (appId.constructor.name !== 'String' || appId === '') {
      throw new Error('appId must be a non-empty string');
    }
    this.appId = appId;
    this.screen = screen;
    this.space = space;
    this.frame = frame;
  }
  static get maximize() : Rectangle {
    return { x: 0, y: 0, width: 100, height: 100 };
  }
}
/**
 * Represents an arrangement of screens and spaces and the bindings that go with that arrangement
 */
class SpaceBinding {
  _windowBindings: {};
  _name: string;
  _screenSpaces: number[];
  constructor(name: string, space? : number[]) {
    this._windowBindings = {};
    this._screenSpaces = [];
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
    // @ts-ignore
    return _.isEqual(screenSpaces, this._screenSpaces);
  }
  setScreenSpaces(spaces: number[]) : void {
    this._screenSpaces = [...spaces];
  }
  set screenSpaces(spaces: number[]) {
    this.setScreenSpaces(spaces);
  }
  get screenSpaces() : number[] {
    return [...this._screenSpaces];
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
interface WindowManagerParameters {
  bindingSet?: BindingSet;
  logger?: Logger;
  snapToEdgeThreshold?: number;
}
class WindowManager {
  _logger: Logger;
  _bindingSet: BindingSet;
  _snapToEdgeThreshold: number;
  _excludes: { [appId: string]: boolean };

  constructor({logger, bindingSet, snapToEdgeThreshold} : WindowManagerParameters) {
    this._logger = logger || new Logger();
    this._excludes = {};
    this._bindingSet = bindingSet || new BindingSet();
    this._snapToEdgeThreshold = undefined === snapToEdgeThreshold ? 5 : snapToEdgeThreshold;
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

  _reframe(windowFrame: Rectangle, oldScreenFrame: Rectangle, newScreenFrame: Rectangle, axis: string, size: string, newFrame: object) {
    const logger = this._logger;
    const oldScreenFrameEnd = oldScreenFrame[axis] + oldScreenFrame[size];
    const newScreenFrameEnd = newScreenFrame[axis] + newScreenFrame[size];
    const windowEnd = windowFrame[axis] + windowFrame[size];
    const windowStartDelta = windowFrame[axis] - oldScreenFrame[axis];
    const windowEndDelta = windowEnd - oldScreenFrameEnd;
    logger.logIndent(3, `startDelta: ${windowStartDelta}. endDelta: ${windowEndDelta}`);
    newFrame[size] = windowFrame[size];    // default: same as current size
    newFrame[axis] = newScreenFrame[axis]; // default: origin (top/left)

    if (windowFrame[size] > newScreenFrame[size]) {
      // Window is too large to fit on new screen. Shrink to fit.
      logger.logIndent(3, `${axis}: Shrink`);
      newFrame[size] = newScreenFrame[size];
    }
    else if (looseEquals(windowFrame[size], oldScreenFrame[size], this._snapToEdgeThreshold)) {
      // Window was maximized. Keep window maximized
      logger.logIndent(3, `${axis}: Maximize`);
      newFrame[size] = newScreenFrame[size];
    }
    else if (windowStartDelta >= this._snapToEdgeThreshold && windowEndDelta <= -this._snapToEdgeThreshold) {
      // Whole window was on old screen.
      // Position so the same relative amount of space is present on both sides before and after.
      logger.logIndent(3, `${axis}: Position normally`);
      const scaleZ = (newScreenFrame[size] - windowFrame[size]) / (oldScreenFrame[size] - windowFrame[size]);
      newFrame[axis] = windowStartDelta * scaleZ + newScreenFrame[axis];
    }
    else if (Math.abs(windowStartDelta) <= this._snapToEdgeThreshold
          || windowEnd <= oldScreenFrame[axis]
          || windowStartDelta < 0 && windowEndDelta < 0) {
      logger.logIndent(3, `${axis}: Flush ${axes[axis].start}`);
      // Flush start, or off of the screen towards the start.
      // Make flush start (default).
    }
    else if (Math.abs(windowEndDelta) <= this._snapToEdgeThreshold
          || windowFrame[axis] >= oldScreenFrameEnd
          || windowStartDelta > 0 && windowEndDelta > 0) {
      // Flush end, or off of the screen towards the end. Make flush end.
      logger.logIndent(3, `${axis}: Flush ${axes[axis].end}`);
      newFrame[axis] = newScreenFrameEnd - windowFrame[size];
    }
    else if (windowStartDelta < 0 && windowEndDelta > 0) {
      // Window overflowed old screen on both sides, but will fit on new screen.
      // Center on new screen
      newFrame[axis] = newScreenFrame[axis] + (newScreenFrame[size] - windowFrame[size]) / 2.0;
      logger.logIndent(3, `${axis}: Overflow`);
    }
    else {
      Phoenix.log(`Error: Could not determine placement of window on ${axis} axis! Defaulting to origin.`);
    }
  }

  reframe(windowFrame: Rectangle, oldScreenFrame: Rectangle, newScreenFrame: Rectangle) {
    const logger = this._logger;
    const newFrame : Rectangle = { x: 0, y: 0, width: 0, height: 0 };
    logger.logIndent(3, `Old screen: left: ${oldScreenFrame.x}, top: ${oldScreenFrame.y}, right: ${oldScreenFrame.x + oldScreenFrame.width}, bottom: ${oldScreenFrame.y + oldScreenFrame.height}`);
    logger.logIndent(3, `New screen: left: ${newScreenFrame.x}, top: ${newScreenFrame.y}, right: ${newScreenFrame.x + newScreenFrame.width}, bottom: ${newScreenFrame.y + newScreenFrame.height}`);
    logger.logIndent(3, `Old window: left: ${windowFrame.x}, top: ${windowFrame.y}, right: ${windowFrame.x + windowFrame.width}, bottom: ${windowFrame.y + windowFrame.height}`);
    this._reframe(windowFrame, oldScreenFrame, newScreenFrame, 'x', 'width', newFrame);
    this._reframe(windowFrame, oldScreenFrame, newScreenFrame, 'y', 'height', newFrame);
    logger.logIndent(3, `New window: left: ${newFrame.x}, top: ${newFrame.y}, right: ${newFrame.x + newFrame.width}, bottom: ${newFrame.y + newFrame.height}`);
    return newFrame;
  }

  resizeWindow(windowHandle: Window, fromScreenHandle: Screen, toScreenHandle: Screen, frame: Rectangle) {
    const toScreenFrame = toScreenHandle.flippedVisibleFrame();
    const fromScreenFrame = fromScreenHandle.flippedVisibleFrame();
    const oldWindowFrame = windowHandle.frame();
    var newWindowFrame: Rectangle;
    if (frame) {
      const x = toScreenFrame.x + toScreenFrame.width * (frame.x / 100);
      const y = toScreenFrame.y + toScreenFrame.height * (frame.y / 100);
      const width = toScreenFrame.width * (frame.width / 100);
      const height = toScreenFrame.height * (frame.height / 100);
      newWindowFrame = { x, y, width, height };
    }
    else {
       newWindowFrame = this.reframe(oldWindowFrame, fromScreenFrame, toScreenFrame);
    }
    // @ts-ignore
    if (_.every(newWindowFrame, (value, key) => looseEquals(value, oldWindowFrame[key], 0.5))) {
      this._logger.logIndent(3, 'New frame is same as old frame, not changing.');
    }
    else {
      if (frame) {
        this._logger.logIndent(3, 'Resizing to user-specified dimensions');
      }
      windowHandle.setFrame(newWindowFrame);
    }
  }

  moveWindow(windowHandle: Window, fromSpace: Space, toSpace: Space) {
    fromSpace.removeWindows([windowHandle]);
    toSpace.addWindows([windowHandle]);
  }

  moveBoundWindows() : void {
    const logger = this._logger;
    logger.log("Retrieving screens.");
    const screenHandles = Screen.all();
    //const screenSpaceLayout = getScreenSpaceLayout();
    //const bindingSetName = getCurrentBindingSetName(bindingSets, screenSpaceLayout);
    //const bindingSet = bindingSets[bindingSetName].bindings;
    const screenSpaceLayout = WindowManager.getScreenSpaceLayout();
    const spaceBinding = this.getActiveSpaceBinding();
    // @ts-ignore
    logger.log(`Screen space layout: [${_.join(screenSpaceLayout, ', ')}]. Using binding set ${spaceBinding.name}.`);
    screenHandles.forEach((screenHandle, screen) => {
      logger.log(`Screen ${screen}`);
      const spaceHandles = screenHandle.spaces();
      spaceHandles.forEach((spaceHandle, space) => {
        logger.logIndent(1, `Space ${space}`);
        const windowHandles = spaceHandle.windows();
        windowHandles.forEach((windowHandle, window) => {
          const appId = windowHandle.app().bundleIdentifier();
          logger.logIndent(2, `Window ${window}: "${appId}", "${windowHandle.title()}"`);
          const binding = spaceBinding.windowBinding(appId) || (this._excludes[appId] ? null : spaceBinding.windowBinding('*'));
          if (binding) {
            if (binding.screen !== screen || binding.space !== space) {
              const newScreenHandle = screenHandles[binding.screen];
              if (!newScreenHandle) {
                logger.logIndent(3, `Destination screen ${binding.screen} does not exist, not moving.`);
                return;
              }
              const newSpaceHandle = newScreenHandle.spaces()[binding.space];
              if (!newSpaceHandle) {
                logger.logIndent(3, `Destination space ${binding.space} on screen ${binding.screen} does not exist, not moving.`);
                return;
              }
              logger.logIndent(3, `Moving from screen ${screen}, space ${space} to screen ${binding.screen}, space ${binding.space}`);
              this.moveWindow(
                windowHandle,
                spaceHandles[space],
                newSpaceHandle
              );
              this.resizeWindow(
                windowHandle,
                screenHandles[screen],
                newScreenHandle,
                binding.frame
              );
            }
            else if (binding.frame) {
              this.resizeWindow(
                windowHandle,
                screenHandles[screen],
                screenHandles[screen],
                binding.frame
              );
            }
          }
        });
      });
    });
  }
}
// const _ = require('lodash');

// Preferences

const loggingEnabled = true;
const loggingIndent = 4; // spaces
const snapToEdgeThreshold = 5; // logical pixels

// Key bindings
const logger = new Logger(loggingEnabled, loggingIndent);
const windowManager = new WindowManager({logger, snapToEdgeThreshold});

const enumerateKey = new Key('x', [ 'ctrl', 'shift', 'alt' ], () => enumerateAppWindows(logger));
const moveKey = new Key('z', [ 'ctrl', 'shift', 'alt' ], () => windowManager.moveBoundWindows());

// Window bindings

// If a binding exists for a screen or space that does not exist, the window will not be moved.
// bindingSet 'default' always exists and will be used if no other set matches.
// new SpaceBinding(bindingName, [number_of_spaces_on_screen_0, number_of_spaces_on_screen_1, ...]);
// new WindowBinding(appId, screen, space, [frame]);
// frame is a Rectangle with all values as percentages. The values will be scaled to the dimensions of the destination screen.
// WindowBinding.maximize is short for { x: 0, y:0, width: 100, height: 100 }
// If appId is '*', all windows except excluded windows will be moved to that screen and space.

windowManager.exclude('net.antelle.keeweb'); // on all spaces of primary screen

const workDocked = new SpaceBinding('workDocked', [1, 2, 3]);
windowManager.bindingSet.add(workDocked);

// screen arrangement is laptop[1], vertical screen[0], horizontal screen[2]
// but spaces are labeled (5, 6) (1) (2, 3, 4) in the UI, for some reason

//bind('workDocked', 'google-play-music-desktop-player', 0, 0);
//bind('workDocked', 'com.apple.ActivityMonitor', 0, 0);

// Vertical screen
workDocked.add(new WindowBinding('*', 0, 0));

// Laptop
workDocked.add(new WindowBinding('org.mozilla.firefox', 1, 0, WindowBinding.maximize));
workDocked.add(new WindowBinding('com.tinyspeck.slackmacgap', 1, 1, { x: 0, y: 0, width: 85, height: 85 }));
workDocked.add(new WindowBinding('com.apple.Notes', 1, 1, { x: 40, y: 10, width: 60, height: 90 }));
workDocked.add(new WindowBinding('com.apple.iCal', 1, 1, { x: 0, y: 25, width: 70, height: 75 }));

// Horizontal screen
workDocked.add(new WindowBinding('com.postmanlabs.mac', 2, 0));
workDocked.add(new WindowBinding('com.TechSmith.Snagit2018', 2, 0));
workDocked.add(new WindowBinding('org.freeplane.core', 2, 0));
workDocked.add(new WindowBinding('com.googlecode.iterm2', 2, 1, WindowBinding.maximize));
workDocked.add(new WindowBinding('com.jetbrains.intellij.ce', 2, 2, WindowBinding.maximize));

const undocked = new SpaceBinding('undocked', [4]);
windowManager.bindingSet.add(undocked);

undocked.add(new WindowBinding('com.tinyspeck.slackmacgap', 0, 0));
undocked.add(new WindowBinding('com.apple.Notes', 0, 0));
undocked.add(new WindowBinding('com.apple.iCal', 0, 0));

undocked.add(new WindowBinding('org.mozilla.firefox', 0, 1, WindowBinding.maximize));

undocked.add(new WindowBinding('*', 0, 2));

undocked.add(new WindowBinding('com.googlecode.iterm2', 0, 3, {x: 0, y: 0, width: 92, height: 100}));

undocked.add(new WindowBinding('com.jetbrains.intellij.ce', 0, 3, {x: 8, y: 0, width: 92, height: 100}));

const homeDocked = new SpaceBinding('homeDocked', [3, 3]);

windowManager.bindingSet.add(homeDocked);

// arrangement is monitor[1], laptop[0]
// monitor: [IDEA], [iTerm2], [postman, freeplane]
// laptop: [Firefox], [Slack, Calendar, Notes], [Everything else]

homeDocked.add(new WindowBinding('com.jetbrains.intellij.ce', 1, 0, WindowBinding.maximize));

homeDocked.add(new WindowBinding('com.googlecode.iterm2', 1, 1, WindowBinding.maximize));

homeDocked.add(new WindowBinding('com.postmanlabs.mac', 1, 2));
homeDocked.add(new WindowBinding('org.freeplane.core', 1, 2));

homeDocked.add(new WindowBinding('org.mozilla.firefox', 0, 2, WindowBinding.maximize));

homeDocked.add(new WindowBinding('com.tinyspeck.slackmacgap', 0, 1));
homeDocked.add(new WindowBinding('com.apple.Notes', 0, 1));
homeDocked.add(new WindowBinding('com.apple.iCal', 0, 1));

homeDocked.add(new WindowBinding('*', 0, 0));

function enumerateAppWindows(logger: Logger) {
  logger.log('Retrieving screens');
  const screenHandles = Screen.all();
  const screens = { null: 'null' };
  screenHandles.forEach((screenHandle, index) => {
    screens[screenHandle.identifier()] = index;
    logger.logIndent(1, `screen ${index} = screenID "${screenHandle.identifier()}"`);
  });
  logger.log('Retrieving apps');
  const apps = App.all();
  apps.forEach((appHandle) => {
    const windows = appHandle.windows();
    // Skip apps with no windows
    if (windows.length > 0) {
      logger.logIndent(1, `appId "${appHandle.bundleIdentifier()}" app "${appHandle.name()}" `);
      windows.forEach((windowHandle) => {
        const screenHandle = windowHandle.screen();
        const screenId = screenHandle ? screenHandle.identifier() : 'null';
        const windowFrame = windowHandle.frame();
        const screenFrame = screenHandle.flippedVisibleFrame();
        const x = 100 * (windowFrame.x - screenFrame.x) / screenFrame.width;
        const y = 100 * (windowFrame.y - screenFrame.y) / screenFrame.height;
        const width = 100 * windowFrame.width / screenFrame.width;
        const height = 100 * windowFrame.height / screenFrame.height;
        logger.logIndent(2, `screen: ${screens[screenId]}, window: "${windowHandle.title()}" x: ${x}, y: ${y}, width: ${width}, height: ${height}`);
      });
    }
  });
}
