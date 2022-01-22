import { AppThunk } from "../../app/store";

export type MessageHandler = (packet: Packet) => AppThunk;

export type Packet = {
  type: string;
  uuid: string;
  peerId: string;
};
