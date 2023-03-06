import { Button, MantineTheme, TextInput } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { IconClipboard, IconClipboardCheck } from "@tabler/icons";
import { useState } from "react";
import { useSelector } from "react-redux";
import style from "./Peer.module.css";
import PeerPopover from "./PeerPopover";
import { selectPeerConnectionState, selectPeerId } from "./peerSlice";

const PeerDisplay = () => {
  const clipboard = useClipboard();
  const peerId = useSelector(selectPeerId);
  const peerState = useSelector(selectPeerConnectionState);
  const [showPopover, setShowPopover] = useState(false);
  return (
    <PeerPopover
      opened={showPopover}
      onClose={() => setShowPopover(false)}
      width="target"
    >
      <TextInput
        readOnly
        value={peerId ?? ""}
        className={getStyle(peerState)}
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
    </PeerPopover>
  );
};

const getStyle = (peerState: "disconnected" | "connecting" | "connected") => {
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
  return className;
};
export default PeerDisplay;
