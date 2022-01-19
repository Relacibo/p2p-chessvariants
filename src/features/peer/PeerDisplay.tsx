import { Box, Text, TextInput, Tip } from "grommet";
import React from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { selectPeerConnecting, selectPeerConnections, selectPeerConnectionState, selectPeerId } from "./peerSlice";

const COLOR_DISCONNECTED = "#CCCCCC";
const COLOR_CONNECTING = "#FFAA15";
const COLOR_CONNECTED = "#00C781";

function createTooltip() {
  const connecting = useSelector(selectPeerConnecting);
  const connections = useSelector(selectPeerConnections);
  const connectingElement = connecting.map((peerId) => );
  const connectedElement = 

  return (<Box>{connectingElement}{connectedElement}</Box>)
}

const PeerDisplay = () => {
  const peerId = useSelector(selectPeerId);
  const peerState = useSelector(selectPeerConnectionState);
  let color;
  switch (peerState) {
    case "disconnected":
      color = "#CCCCCC";
      break;
    case "connecting":
      color = "#FFAA15";
      break;
    case "connected":
      color = "#00C781";
      break;
  }
  return (
    <Tip content={
      createTooltip()
    }>
      <Box gap="xsmall">
        <Text margin={{ left: "xsmall" }} color="accent-1">
          Peer ID
        </Text>
        <TextInput
          readOnly
          width="auto"
          value={peerId}
          style={{ cursor: "pointer", fontSize: "0.8em", color }}
          onClick={() => {
            if (typeof peerId !== "undefined") {
              navigator.clipboard.writeText(peerId);
              toast.info(`Copied peer id to clipboard!`);
            }
          }}
        />
      </Box>
    </Tip>
  );
};
export default PeerDisplay;
