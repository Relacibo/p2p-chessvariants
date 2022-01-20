import {
  Box,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Text,
  TextInput,
  Tip,
} from "grommet";
import React from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import {
  selectPeerConnecting,
  selectPeerConnections,
  selectPeerConnectionState,
  selectPeerId,
} from "./peerSlice";

const COLOR_DISCONNECTED = "#CCCCCC";
const COLOR_CONNECTING = "#FFAA15";
const COLOR_CONNECTED = "#00C781";

function createTooltip() {
  const connecting = useSelector(selectPeerConnecting);
  const connections = useSelector(selectPeerConnections);
  const connectingElements = connecting.map((peerId) => (
    <TableRow style={{ color: COLOR_CONNECTING }}>
      <TableCell>{peerId}</TableCell>
      <TableCell>
        <Spinner />
      </TableCell>
    </TableRow>
  ));
  const connectedElements = Object.entries(connections).map(
    ([uuid, peerId]) => (
      <TableRow style={{ color: COLOR_CONNECTED }}>
        <TableCell>{peerId}</TableCell>
        <TableCell>{uuid}</TableCell>
      </TableRow>
    )
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableCell scope="col" border="bottom">
            PeerId
          </TableCell>
          <TableCell scope="col" border="bottom">
            UUID
          </TableCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {connectingElements}
        {connectedElements}
      </TableBody>
    </Table>
  );
}

const PeerDisplay = () => {
  const peerId = useSelector(selectPeerId);
  const peerState = useSelector(selectPeerConnectionState);
  let color;
  switch (peerState) {
    case "disconnected":
      color = COLOR_DISCONNECTED;
      break;
    case "connecting":
      color = COLOR_CONNECTING;
      break;
    case "connected":
      color = COLOR_CONNECTED;
      break;
  }
  return (
    <Tip content={createTooltip()}>
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
