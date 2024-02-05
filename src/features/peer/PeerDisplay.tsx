import { Button, TextInput } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { IconClipboard, IconClipboardCheck } from "@tabler/icons-react";
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
            className={style.peerButton}
            size="compact-md"
            onClick={() => {
              if (typeof peerId !== "undefined") {
                clipboard.copy(peerId);
              }
            }}
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
