const axes = {
  x: { start: 'left', end: 'right' },
  y: { start: 'top', end: 'bottom' }
};

function looseEquals(arg1: number, arg2: number, epsilon: number = 0.01) : boolean {
  if (arg1 === arg2) { return true; }
  const arg1m = Math.abs(arg1);
  const arg2m = Math.abs(arg2);
  const averagem = (arg1m + arg2m / 2.0);
  const difference = Math.abs(arg1 - arg2);
  return difference <= (epsilon * averagem);
  // example: 2.0 vs 2.1
  // arg1m = 2.0, arg2m = 2.1, averagem = 2.05, difference = 0.1
  // 0.1 <= 0.01 * 2.05
  // 0.1 <= 0.0205 is false
  // 2.0 vs 2.01
  // arg1m = 2.0, arg2m = 2.01, averagem = 2.005, difference = 0.01
  // 0.01 <= 0.02005 is true
  // -2 vs 2
  // 2, 2, 2, 4
  // 4 < 0.04 is false
}
// Classes
function centerWindow(screenFrame: Rectangle, windowFrame: Rectangle) : Point {
  const x = screenFrame.x + (screenFrame.width - windowFrame.width) / 2.0;
  const y = screenFrame.y + (screenFrame.height - windowFrame.height) / 2.0;
  return {x, y};
}

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
  async log(...output: any[]) {
    if (this._enabled) {
      Phoenix.log(...output);
    }
  }
  async logIndent(level: number, message: string, ...output: any[]) {
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
Class WindowBinding represents a single binding, of a window to a screen and space, with optional arrangement properties (maximize, location)
Class SpaceBinding represents an arrangement of screens and spaces and the bindings that go with that arrangement
Class BindingSet represents the full set of all arrangements
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
    if (appId === null || appId === undefined || appId.constructor.name !== 'String' || appId === '') {
      throw 'appId must be a non-empty string';
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
  _default: WindowBinding;
  constructor(name: string, space? : number[]) {
    this._windowBindings = {};
    this._screenSpaces = [];
    this._name = name;
    if (space !== undefined) {
      this.setScreenSpaces(space);
    }
  }
  add(windowBinding: WindowBinding) : void {
    this._windowBindings[windowBinding.appId] = windowBinding;
  }
  addNew(appId: string, screen = 0, space = 0, frame?: Rectangle) {
    this.add(new WindowBinding(appId, screen, space, frame));
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
  get defaultBinding() {
    return this._default;
  }
  set defaultBinding(windowBinding: WindowBinding) {
    this._default = windowBinding;
  }
}

/**
 * Represents the full set of all arrangements, including the default
 */
class BindingSet {
  _spaceBindings: { [name: string]: SpaceBinding };
  _count: number;
  constructor() {
    this._spaceBindings = {};
    this.add(new SpaceBinding('default'));
    this._count = 1;
  }
  add(spaceBinding: SpaceBinding) : void {
    this._spaceBindings[spaceBinding._name] = spaceBinding;
    this._count = Object.keys(this._spaceBindings).length;
  }
  remove(name: string) : void {
    delete this._spaceBindings[name];
    this._count = Object.keys(this._spaceBindings).length;
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
  getBindingSpaces() : string {
    return _.join(
      _.map(
        this._spaceBindings,
        (binding, name) => `${name}: [${_.join(binding.screenSpaces, ", ")}]`),
      '\n'
    );
  }
  get count() : number {
    return this._count;
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
interface WindowInfo {
  window: Window;
//  screen: Screen;
  space: Space;
  screenIndex: number;
  spaceIndex: number;
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
    // Always exclude Phoenix itself.
    this.exclude('org.khirviko.Phoenix');
  }
  static async getScreenSpaceLayout() : Promise<number[]> {
    return Screen.all().map(screenHandle => screenHandle.spaces().length);
  }
  exclude(appId: string, value = true) : void {
    this._excludes[appId] = value;
  }
  async getActiveSpaceBindingName() : Promise<string> {
    const currentLayout = await WindowManager.getScreenSpaceLayout();
    const setName = this._bindingSet.match(currentLayout);
    if (!setName || setName === "default") {
      const screenFrame = Screen.main().visibleFrame();
      const errorText = `phoenix-move-windows: Could not find layout matching [${_.join(currentLayout, ", ")}].\n${this._bindingSet.getBindingSpaces()}`;
      Modal.build({
        text: errorText,
        duration: _.min([2 + 2 * this._bindingSet.count, 8]),
        origin: (windowFrame) => centerWindow(screenFrame, windowFrame),
      }).show();
      throw errorText;
    }
    return setName;
  }

  async getActiveSpaceBinding() : Promise<SpaceBinding> {
    return this._bindingSet.binding(await this.getActiveSpaceBindingName());
  }

  get bindingSet() : BindingSet {
    return this._bindingSet;
  }

  async _reframe(windowFrame: Rectangle, oldScreenFrame: Rectangle, newScreenFrame: Rectangle, axis: string, size: string, newFrame: object) {
    const logger = this._logger;
    const oldScreenFrameEnd = oldScreenFrame[axis] + oldScreenFrame[size];
    const newScreenFrameEnd = newScreenFrame[axis] + newScreenFrame[size];
    const windowEnd = windowFrame[axis] + windowFrame[size];
    const windowStartDelta = windowFrame[axis] - oldScreenFrame[axis];
    const windowEndDelta = windowEnd - oldScreenFrameEnd;
    logger.logIndent(2, `startDelta: ${windowStartDelta}. endDelta: ${windowEndDelta}`);
    newFrame[size] = windowFrame[size];    // default: same as current size
    newFrame[axis] = newScreenFrame[axis]; // default: origin (top/left)

    if (windowFrame[size] > newScreenFrame[size]) {
      // Window is too large to fit on new screen. Shrink to fit.
      logger.logIndent(2, `${axis}: Shrink`);
      newFrame[size] = newScreenFrame[size];
    }
    else if (looseEquals(windowFrame[size], oldScreenFrame[size], this._snapToEdgeThreshold)) {
      // Window was maximized. Keep window maximized
      logger.logIndent(2, `${axis}: Maximize`);
      newFrame[size] = newScreenFrame[size];
    }
    else if (windowStartDelta >= this._snapToEdgeThreshold && windowEndDelta <= -this._snapToEdgeThreshold) {
      // Whole window was on old screen.
      // Position so the same relative amount of space is present on both sides before and after.
      logger.logIndent(2, `${axis}: Position normally`);
      const scaleZ = (newScreenFrame[size] - windowFrame[size]) / (oldScreenFrame[size] - windowFrame[size]);
      newFrame[axis] = windowStartDelta * scaleZ + newScreenFrame[axis];
    }
    else if (Math.abs(windowStartDelta) <= this._snapToEdgeThreshold
          || windowEnd <= oldScreenFrame[axis]
          || windowStartDelta < 0 && windowEndDelta < 0) {
      logger.logIndent(2, `${axis}: Flush ${axes[axis].start}`);
      // Flush start, or off of the screen towards the start.
      // Make flush start (default).
    }
    else if (Math.abs(windowEndDelta) <= this._snapToEdgeThreshold
          || windowFrame[axis] >= oldScreenFrameEnd
          || windowStartDelta > 0 && windowEndDelta > 0) {
      // Flush end, or off of the screen towards the end. Make flush end.
      logger.logIndent(2, `${axis}: Flush ${axes[axis].end}`);
      newFrame[axis] = newScreenFrameEnd - windowFrame[size];
    }
    else if (windowStartDelta < 0 && windowEndDelta > 0) {
      // Window overflowed old screen on both sides, but will fit on new screen.
      // Center on new screen
      newFrame[axis] = newScreenFrame[axis] + (newScreenFrame[size] - windowFrame[size]) / 2.0;
      logger.logIndent(2, `${axis}: Overflow`);
    }
    else {
      Phoenix.log(`Error: Could not determine placement of window on ${axis} axis! Defaulting to origin.`);
    }
  }

  async reframe(windowFrame: Rectangle, oldScreenFrame: Rectangle, newScreenFrame: Rectangle) {
    const logger = this._logger;
    const newFrame : Rectangle = { x: 0, y: 0, width: 0, height: 0 };
    logger.logIndent(2, `Old screen: left: ${oldScreenFrame.x}, top: ${oldScreenFrame.y}, right: ${oldScreenFrame.x + oldScreenFrame.width}, bottom: ${oldScreenFrame.y + oldScreenFrame.height}`);
    logger.logIndent(2, `New screen: left: ${newScreenFrame.x}, top: ${newScreenFrame.y}, right: ${newScreenFrame.x + newScreenFrame.width}, bottom: ${newScreenFrame.y + newScreenFrame.height}`);
    logger.logIndent(2, `Old window: left: ${windowFrame.x}, top: ${windowFrame.y}, right: ${windowFrame.x + windowFrame.width}, bottom: ${windowFrame.y + windowFrame.height}`);
    await Promise.all([
      this._reframe(windowFrame, oldScreenFrame, newScreenFrame, 'x', 'width', newFrame),
      this._reframe(windowFrame, oldScreenFrame, newScreenFrame, 'y', 'height', newFrame)
    ]);
    logger.logIndent(2, `New window: left: ${newFrame.x}, top: ${newFrame.y}, right: ${newFrame.x + newFrame.width}, bottom: ${newFrame.y + newFrame.height}`);
    return newFrame;
  }

  async resizeWindow(windowHandle: Window, fromScreenHandle: Screen, toScreenHandle: Screen, frame: Rectangle) : Promise<boolean> {
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
       newWindowFrame = await this.reframe(oldWindowFrame, fromScreenFrame, toScreenFrame);
    }

    const appIdentifier = windowHandle.app().bundleIdentifier();

    if (_.every(newWindowFrame, (value, key) => looseEquals(value, oldWindowFrame[key], 0.01))) {
      this._logger.logIndent(2, `New frame is same as old frame, not changing ${appIdentifier}.`);
      return false;
    }
    else {
      if (frame) {
        this._logger.logIndent(2, `Resizing ${appIdentifier} to user-specified dimensions. Old frame: x ${oldWindowFrame.x}, y ${oldWindowFrame.y}, width ${oldWindowFrame.width}, height ${oldWindowFrame.height}. New frame: x ${newWindowFrame.x}, y ${newWindowFrame.y}, width ${newWindowFrame.width}, height ${newWindowFrame.height}.`);
      }
      windowHandle.setFrame(newWindowFrame);
      return true;
    }
  }

  static async moveWindow(windowHandle: Window, fromSpace: Space, toSpace: Space) {
    fromSpace.removeWindows([windowHandle]);
    toSpace.addWindows([windowHandle]);
  }

  static launchModal(text: string, duration: number, frame: Rectangle) : Modal {
    logger.log(`Launching modal: ${text}`);
    const modal = Modal.build({
      text,
      duration,
      origin: windowFrame => centerWindow(frame, windowFrame)
    });
    modal.animationDuration = 0.1; // 100ms
    modal.show();
    return modal;
  }

  static async buildWindowList(spaces: Space[], screenIndex: number) : Promise<WindowInfo[]> {
    const results = [];
    spaces.forEach((space, spaceIndex) => {
      results.push(
        ...space.windows().map(
          (window) => ({window, spaceIndex, screenIndex, space})
        )
      );
    });
    return results;
  }

  static getSpaces() : Space[][] {
    return Screen.all().map(screen => screen.spaces());
  }

  getWindowBinding(window: Window, spaceBinding: SpaceBinding) : WindowBinding {
    const appId = window.app().bundleIdentifier();
    if (this._excludes[appId]) {
      return null;
    }
    return spaceBinding.windowBinding(appId) || spaceBinding.defaultBinding;
  }

  async moveBoundWindows() {
    const logger = this._logger;
    logger.log("Retrieving screens.");

    const currentScreenFrame = Screen.main().visibleFrame();

    const screenSpaceLayout = await WindowManager.getScreenSpaceLayout();
    let spaceBinding: SpaceBinding;
    try {
      spaceBinding = await this.getActiveSpaceBinding();
    }
    catch (e) {
      logger.log(e);
      return;
    }

    // 100ms wait required to allow movingWindows modal time to appear
    const movingWindows = await later(100, WindowManager.launchModal('Moving windows...',
      10, // Should be closed automatically at the end of moveBoundWindows, setting duration just in case it's not
      currentScreenFrame
      ));
    const spaces = WindowManager.getSpaces();
    const screens = Screen.all();

    logger.log(`Screen space layout: [${_.join(screenSpaceLayout, ', ')}]. Using binding set ${spaceBinding.name}.`);
    const windowInfos = _.flatten(await Promise.all(spaces.map(WindowManager.buildWindowList)));
    const count = _.sum(await Promise.all(windowInfos.map(async (windowInfo) => {
      const binding = this.getWindowBinding(windowInfo.window, spaceBinding);
      if (binding) {
        const oldScreen = screens[windowInfo.screenIndex];
        if (binding.screen !== windowInfo.screenIndex || binding.space !== windowInfo.spaceIndex) {
          const newScreen = screens[binding.screen];
          const newSpace = spaces[binding.screen][binding.space];
          if (!newScreen || !newSpace) {
            logger.logIndent(1, `Destination screen or space does not exist for binding ${binding.appId}.`);
            return 0;
          }
          logger.logIndent(1, `Moving app "${windowInfo.window.app().name()}" window "${windowInfo.window.title()}" from screen ${windowInfo.screenIndex}, space ${windowInfo.spaceIndex} to screen ${binding.screen}, space ${binding.space}`);
          WindowManager.moveWindow(windowInfo.window, windowInfo.space, newSpace);
          this.resizeWindow(
            windowInfo.window,
            oldScreen,
            newScreen,
            binding.frame
          );
          return 1;
        }
        else if (binding.frame) {
          return (await this.resizeWindow(windowInfo.window, oldScreen, oldScreen, binding.frame)) ? 1 : 0;
        }
      }
      return 0;
    })));

    // Give movingWindows close animation time to run
    await later(100, movingWindows.close());

    WindowManager.launchModal(
      `Moved ${count} window${count === 1 ? '' : 's'}`,
      // display for no less than 2 but no more than 6 seconds, increasing by 0.5 seconds per window moved
      _.max([2, _.min([6, count/2.0])]),
      currentScreenFrame
    );
  }
}

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
        if (screenHandle) {
          const screenId = screenHandle.identifier();
          const windowFrame = windowHandle.frame();
          const screenFrame = screenHandle.flippedVisibleFrame();
          const x = 100 * (windowFrame.x - screenFrame.x) / screenFrame.width;
          const y = 100 * (windowFrame.y - screenFrame.y) / screenFrame.height;
          const width = 100 * windowFrame.width / screenFrame.width;
          const height = 100 * windowFrame.height / screenFrame.height;
          logger.logIndent(2, `screen: ${screens[screenId]}, window: "${windowHandle.title()}" x: ${x}, y: ${y}, width: ${width}, height: ${height}.`);
        }
        else {
          logger.logIndent(2, `windowHandle "${windowHandle.title()}" has no screenHandle.`);
        }
      });
    }
  });
}

function later<T>(milliseconds: number, value?: T) : Promise<T> {
  return new Promise(resolve => setTimeout(resolve.bind(null, value), milliseconds));
}

// Preferences

const loggingEnabled = true;
const loggingIndent = 4; // spaces
const snapToEdgeThreshold = 0.01; // fractional difference

// Initialization

const logger = new Logger(loggingEnabled, loggingIndent);
const windowManager = new WindowManager({logger, snapToEdgeThreshold});

// Key bindings

const enumerateKey = new Key('x', [ 'ctrl', 'shift', 'alt' ], () => enumerateAppWindows(logger));
const moveKey = new Key('z', [ 'ctrl', 'shift', 'alt' ], windowManager.moveBoundWindows.bind(windowManager));

// Window bindings

// If a binding exists for a screen or space that does not exist, the window will not be moved.
// bindingSet 'default' always exists and will be used if no other set matches.
// new SpaceBinding(bindingName, [number_of_spaces_on_screen_0, number_of_spaces_on_screen_1, ...]);
// new WindowBinding(appId, screen, space, [frame]);
// frame is a Rectangle with all values as percentages. The values will be
//   scaled to the dimensions of the destination screen.
// WindowBinding.maximize is short for { x: 0, y:0, width: 100, height: 100 }
// If the default binding for a bindingSet is set, all windows that don't match another binding
//   will be moved to that screen

windowManager.exclude('net.antelle.keeweb'); // on all spaces of primary screen
windowManager.exclude('org.keepassx.keepassxc'); // on all spaces of primary screen

const workDocked = new SpaceBinding('workDocked', [1, 2, 3]);
windowManager.bindingSet.add(workDocked);

const workLaptop = 1;
const workCenter = 0;
const workRight = 2;

const slack: Rectangle = { x: 0, y: 0, width: 85, height: 85 };
const notes: Rectangle = { x: 40, y: 10, width: 60, height: 90 };
const ical: Rectangle = { x: 0, y: 25, width: 70, height: 75 };
//bind('workDocked', 'google-play-music-desktop-player', 0, 0);
//bind('workDocked', 'com.apple.ActivityMonitor', 0, 0);


// Laptop
workDocked.addNew('org.mozilla.firefox', workLaptop, 0, WindowBinding.maximize);

workDocked.addNew('com.tinyspeck.slackmacgap', workLaptop, 1, slack);
workDocked.addNew('com.apple.Notes', workLaptop, 1, notes);
workDocked.addNew('com.apple.iCal', workLaptop, 1, ical);

// Center screen
workDocked.defaultBinding = new WindowBinding('*', workCenter, 0);


// Right screen
workDocked.addNew('com.postmanlabs.mac', workRight, 0);
workDocked.addNew('com.TechSmith.Snagit2018', workRight, 0);
workDocked.addNew('org.freeplane.core', workRight, 0);

workDocked.addNew('com.googlecode.iterm2', workRight, 1, WindowBinding.maximize);


////// Tall IntelliJ for Java development //////

// laptop[2], vertical screen[2], horizontal screen[2]

const workJava = new SpaceBinding('workJava', [2, 2, 2]);
windowManager.bindingSet.add(workJava);

// Laptop
workJava.addNew('org.mozilla.firefox', workLaptop, 0, WindowBinding.maximize);

workJava.addNew('com.tinyspeck.slackmacgap', workLaptop, 1, slack);
workJava.addNew('com.apple.Notes', workLaptop, 1, notes);
workJava.addNew('com.apple.iCal', workLaptop, 1, ical);

// Vertical screen
workJava.defaultBinding = new WindowBinding('*', workCenter, 0);

workJava.addNew('com.jetbrains.intellij.ce', workCenter, 1, WindowBinding.maximize);

// Horizontal screen
workJava.addNew('com.postmanlabs.mac', workRight, 0);
workJava.addNew('com.TechSmith.Snagit2018', workRight, 0);
workJava.addNew('org.freeplane.core', workRight, 0);

workJava.addNew('com.googlecode.iterm2', workRight, 1, WindowBinding.maximize);

////// Laptop alone (1, 2, 3, 4) //////

const undocked = new SpaceBinding('undocked', [4]);
windowManager.bindingSet.add(undocked);

// Space 1
undocked.addNew('com.tinyspeck.slackmacgap', 0, 0, slack);
undocked.addNew('com.apple.Notes', 0, 0, notes);
undocked.addNew('com.apple.iCal', 0, 0, ical);

// Space 2
undocked.addNew('org.mozilla.firefox', 0, 1, WindowBinding.maximize);

// Space 3
undocked.defaultBinding = new WindowBinding('*', 0, 2);

// Space 4
undocked.addNew('com.googlecode.iterm2', 0, 3, {x: 0, y: 0, width: 92, height: 100});
undocked.addNew('com.jetbrains.intellij.ce', 0, 3, {x: 8, y: 0, width: 92, height: 100});

const homeDocked = new SpaceBinding('homeDocked', [2, 3]);

windowManager.bindingSet.add(homeDocked);

// arrangement is laptop[0], monitor[1]
// monitor: [Everything else] [iTerm2] [IDEA]
// laptop: [Slack, Calendar, Notes] [Firefox]

homeDocked.addNew('com.jetbrains.intellij.ce', 1, 2, WindowBinding.maximize);

homeDocked.addNew('com.googlecode.iterm2', 1, 1, WindowBinding.maximize);

homeDocked.addNew('org.mozilla.firefox', 0, 1, WindowBinding.maximize);

homeDocked.defaultBinding = new WindowBinding('*', 1, 0);

homeDocked.addNew('com.tinyspeck.slackmacgap', 0, 0, slack);
homeDocked.addNew('com.apple.Notes', 0, 0, notes);
homeDocked.addNew('com.apple.iCal', 0, 0, ical);
