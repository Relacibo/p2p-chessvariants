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
import PeerTooltip from "./PeerTooltip";
import style from "./Peer.module.css";

const PeerDisplay = () => {
  const peerId = useSelector(selectPeerId);
  const peerState = useSelector(selectPeerConnectionState);
  let className;
  switch (peerState) {
    case "disconnected":
      className = style.disconnected;
      break;
    case "connecting":
      className = style.connecting;
      break;
    case "connected":
      className = style.connected;
      break;
  }
  return (
    <PeerTooltip>
      <Box gap="xsmall">
        <Text margin={{ left: "xsmall" }} color="accent-1">
          Peer ID
        </Text>
        <TextInput
          readOnly
          width="auto"
          value={peerId}
          className={className}
          style={{ cursor: "pointer", fontSize: "0.8em" }}
          onClick={() => {
            if (typeof peerId !== "undefined") {
              navigator.clipboard.writeText(peerId);
              toast.info(`Copied peer id to clipboard!`);
            }
          }}
        />
      </Box>
    </PeerTooltip>
  );
};
export default PeerDisplay;
