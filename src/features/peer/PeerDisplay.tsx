import { Box, Button, Grid, Text, TextInput } from "grommet";
import React, { useRef, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { selectPeerConnectionState, selectPeerId } from "./peerSlice";
import PeerDrop from "./PeerDrop";
import style from "./Peer.module.css";
import { Copy } from "grommet-icons/icons";

const PeerDisplay = () => {
  const peerId = useSelector(selectPeerId);
  const peerState = useSelector(selectPeerConnectionState);
  const dropTargetRef = useRef() as React.MutableRefObject<HTMLInputElement>;
  const [showDrop, setShowDrop] = useState(false);
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
    <>
      <Box gap="xsmall" ref={dropTargetRef}>
        <Text margin={{ left: "xsmall" }} color="accent-1">
          Peer ID
        </Text>
        <Grid columns={["flex", "auto"]} align="center">
          <TextInput
            readOnly
            width="auto"
            value={peerId || ""}
            className={className}
            style={{ cursor: "pointer", fontSize: "0.7em" }}
            onClick={() => setShowDrop(!showDrop)}
          />
          <Button
            onClick={() => {
              if (typeof peerId !== "undefined") {
                navigator.clipboard.writeText(peerId);
                toast.info(`Copied peer id to clipboard!`);
              }
            }}
            margin={{ left: ".5rem" }}
          >
            <Copy />
          </Button>
        </Grid>
      </Box>
      {showDrop && (
        <PeerDrop
          target={dropTargetRef}
          close={() => {
            setShowDrop(false);
          }}
        />
      )}
    </>
  );
};
export default PeerDisplay;
