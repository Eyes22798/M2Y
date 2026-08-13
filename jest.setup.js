require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const createAnimatedComponent = (Component) => Component;

  return {
    __esModule: true,
    default: { createAnimatedComponent, View },
    useAnimatedStyle: (factory) => factory(),
    useReducedMotion: () => true,
    useSharedValue: (initialValue) => ({
      value: initialValue,
      get() {
        return this.value;
      },
      set(nextValue) {
        this.value = typeof nextValue === 'function' ? nextValue(this.value) : nextValue;
      },
    }),
    withSpring: (value) => value,
    withTiming: (value) => value,
  };
});
jest.mock('expo-symbols', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    SymbolView: (props) => React.createElement(View, { ...props, testID: 'app-icon' }),
  };
});
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    FlashList: ({ data = [], renderItem, ...props }) =>
      React.createElement(
        View,
        props,
        data.map((item, index) =>
          React.createElement(
            React.Fragment,
            { key: props.keyExtractor?.(item, index) ?? index },
            renderItem({ item, index, target: 'Cell' }),
          ),
        ),
      ),
  };
});
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
