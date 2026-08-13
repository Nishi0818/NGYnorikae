// `babel-preset-expo` is hoisted by pnpm on Vercel. Resolve it by package
// name rather than assuming Expo's nested node_modules layout.
const expoPreset = require.resolve("babel-preset-expo");

module.exports = function (api) {
  api.cache(true);
  let plugins = [];

  plugins.push("react-native-worklets/plugin");

  return {
    presets: [[expoPreset, { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins,
  };
};
