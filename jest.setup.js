require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');

  return {
    KeyboardProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');

  return {
    SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    SafeAreaView: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});
