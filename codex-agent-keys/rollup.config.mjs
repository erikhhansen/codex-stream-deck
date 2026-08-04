import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

function streamDockTouchbarCompatibility() {
  const missingDeviceLookup = "const device = deviceStore.getDeviceById(source.device);";
  const compatibleDeviceLookup = `let device = deviceStore.getDeviceById(source.device);
        // Stream Dock represents its Touchbar as a synthetic device and can
        // send action events before it announces any devices after switching
        // between Button and Touchbar modes. Associate the action with the
        // physical device when one is available.
        if (!device) {
            const connectedDevices = [...deviceStore];
            device = connectedDevices.find((candidate) => /n4/i.test(candidate.name)) ?? connectedDevices.at(-1);
        }
        // If Stream Dock has not announced a device yet, keep a minimal device
        // record so the SDK can accept willAppear and deliver the live image.
        // The action context only needs stable device metadata; setImage is
        // addressed by the action context itself.
        if (!device) {
            device = {
                id: source.device,
                name: "Stream Dock N4 Pro",
                size: { columns: 5, rows: 2 },
                type: 0,
                isConnected: true,
                get actions() { return []; }
            };
            deviceStore.set(device);
        }`;
  const parsedMessage = "const message = JSON.parse(ev.data.toString());";
  const compatibleParsedMessage = `const message = JSON.parse(ev.data.toString());
            // Stream Dock names its physical dial controller \"Knob\". Normalize
            // it to the Stream Deck SDK's equivalent \"Encoder\" before the
            // action service constructs and routes the action context.
            if (message?.payload?.controller === \"Knob\") {
                message.payload.controller = \"Encoder\";
            }`;

  return {
    name: "stream-dock-touchbar-compatibility",
    transform(code, id) {
      if (id.endsWith("/@elgato/streamdeck/dist/plugin/actions/context.js")) {
        if (!code.includes(missingDeviceLookup)) {
          throw new Error("The Stream Deck SDK action context changed; update the Stream Dock compatibility patch");
        }
        return { code: code.replace(missingDeviceLookup, compatibleDeviceLookup), map: null };
      }
      if (id.endsWith("/@elgato/streamdeck/dist/plugin/connection.js")) {
        if (!code.includes(parsedMessage)) {
          throw new Error("The Stream Deck SDK connection parser changed; update the Stream Dock knob compatibility patch");
        }
        return { code: code.replace(parsedMessage, compatibleParsedMessage), map: null };
      }
      return null;
    }
  };
}

export default {
  input: "src/plugin.ts",
  output: {
    file: "com.codexstreamdeck.agentkeys.sdPlugin/bin/plugin.js",
    format: "esm",
    sourcemap: true
  },
  plugins: [streamDockTouchbarCompatibility(), nodeResolve({ preferBuiltins: true }), commonjs(), typescript()],
  external: [/^node:/]
};
