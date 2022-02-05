import { Button, MantineTheme, TextInput } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { IconClipboard, IconClipboardCheck } from "@tabler/icons";
import React, { useState } from "react";
import { useSelector } from "react-redux";
import style from "./Peer.module.css";
import PeerPopover from "./PeerPopover";
import { selectPeerConnectionState, selectPeerId } from "./peerSlice";

const PeerDisplay = () => {
  const clipboard = useClipboard();
  const peerId = useSelector(selectPeerId);
  const peerState = useSelector(selectPeerConnectionState);
  const [showPopover, setShowPopover] = useState(false);
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
    <PeerPopover
      opened={showPopover}
      target={
        <TextInput
          readOnly
          label="Peer ID"
          value={peerId || ""}
          className={className}
          styles={{
            input: { cursor: "pointer", fontSize: "0.7em" },
          }}
          onClick={() => setShowPopover((s) => !s)}
          rightSection={
            <Button
              compact
              onClick={() => {
                if (typeof peerId !== "undefined") {
                  clipboard.copy(peerId);
                }
              }}
              styles={(theme: MantineTheme) => ({
                root: {
                  background: "none !important",
                  color:
                    theme.colorScheme === "dark"
                      ? theme.white
                      : theme.colors.dark[2],
                  "&:hover": {
                    color: theme.colors.green[4],
                  },
                },
              })}
            >
              {clipboard.copied ? <IconClipboardCheck /> : <IconClipboard />}
            </Button>
          }
        />
      }
      onClose={() => setShowPopover((s) => !s)}
      style={{ width: "100%" }}
    />
  );
};
export default PeerDisplay;
