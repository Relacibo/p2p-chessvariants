import { Button, Loader, Popover, PopoverProps, Table } from "@mantine/core";
import { IconUnlink } from "@tabler/icons";
import React from "react";
import { useDispatch, useSelector } from "../../app/hooks";
import style from "./Peer.module.css";
import {
  disconnectFromPeer,
  selectPeerConnecting,
  selectPeerConnections,
} from "./peerSlice";

type PeerPopoverProps = Partial<PopoverProps> & {
  children: React.ReactElement;
  opened: boolean;
  onClose: () => void;
};

const PeerPopover = ({ children, opened, onClose }: PeerPopoverProps) => {
  const popoverProps = { opened, onClose };
  const dispatch = useDispatch();
  const connecting = useSelector(selectPeerConnecting);
  const connections = useSelector(selectPeerConnections);
  const createCloseButton = (peerId: string) => (
    <Button
      compact
      size="xs"
      variant="subtle"
      onClick={() => dispatch(disconnectFromPeer(peerId))}
    >
      <IconUnlink size={16} />
    </Button>
  );
  const connectionTable = connecting
    .map((peerId) => (
      <tr key={peerId} className={style.connecting}>
        <td>{peerId}</td>
        <td>
          <Loader size="xs" color="red" />
        </td>
        <td>{createCloseButton(peerId)}</td>
      </tr>
    ))
    .concat(
      Object.entries(connections).map(([uuid, peerId]) => (
        <tr key={peerId} className={style.connected}>
          <td>{peerId}</td>
          <td>{uuid}</td>
          <td>{createCloseButton(peerId)}</td>
        </tr>
      )) || []
    );
  return (
    <Popover {...popoverProps}>
      <Popover.Target>{children}</Popover.Target>
      <Popover.Dropdown>
        {connecting.length + Object.keys(connections).length > 0 ? (
          <Table>
            <thead>
              <tr>
                <th>PeerId</th>
                <th>UUID</th>
                <th> </th>
              </tr>
            </thead>
            <tbody>{connectionTable}</tbody>
          </Table>
        ) : (
          <></>
        )}
      </Popover.Dropdown>
    </Popover>
  );
};

export default PeerPopover;
