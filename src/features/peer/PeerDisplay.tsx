import { Button, TextInput } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { IconClipboard, IconClipboardCheck } from "@tabler/icons-react";
import { useSelector } from "react-redux";
import { selectLobbyLocalPeerId } from "../lobby/lobbySlice";
import style from "./Peer.module.css";

const PeerDisplay = () => {
  const clipboard = useClipboard();
  const lobbyPeerId = useSelector(selectLobbyLocalPeerId);
  const displayedPeerId = lobbyPeerId ?? "";
  const displayedPeerState = displayedPeerId ? "connected" : "disconnected";
  return (
    <TextInput
      readOnly
      value={displayedPeerId}
      className={getStyle(displayedPeerState)}
      styles={{
        input: { cursor: "pointer", fontSize: "0.7em" },
      }}
      rightSection={
        <Button
          className={style.peerButton}
          size="compact-md"
          onClick={() => {
            if (displayedPeerId) {
              clipboard.copy(displayedPeerId);
            }
          }}
        >
          {clipboard.copied ? <IconClipboardCheck /> : <IconClipboard />}
        </Button>
      }
    />
  );
};

const getStyle = (peerState: "disconnected" | "connected") => {
  switch (peerState) {
    case "connected":
      return style.connected;
    case "disconnected":
    default:
      return style.disconnected;
  }
};
export default PeerDisplay;
