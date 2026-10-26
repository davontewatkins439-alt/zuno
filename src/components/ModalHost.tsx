import React from "react";
import { useApp } from "../state";
import {
  AppealModal,
  CreateChannelModal,
  CreateServerModal,
  InviteModal,
  JoinServerModal,
  KeyboardModal,
  NewDmModal,
  NotificationsModal,
  ReportModal,
} from "./modals/BasicModals";
import { ChannelSettingsModal, MemberRolesModal, ServerSettingsModal } from "./modals/ServerSettings";
import { ProfileModal, UserSettingsModal } from "./modals/UserModals";

export function ModalHost() {
  const app = useApp();
  const modal = app.modal;
  if (!modal) return null;

  switch (modal.type) {
    case "createServer":
      return <CreateServerModal />;
    case "joinServer":
      return <JoinServerModal />;
    case "invite":
      return <InviteModal serverId={modal.serverId} />;
    case "serverSettings":
      return <ServerSettingsModal initialTab={modal.tab} />;
    case "createChannel":
      return <CreateChannelModal categoryId={modal.categoryId} />;
    case "channelSettings":
      return <ChannelSettingsModal channelId={modal.channelId} />;
    case "userSettings":
      return <UserSettingsModal initialTab={modal.tab} />;
    case "profile":
      return <ProfileModal />;
    case "report":
      return <ReportModal targetUserId={modal.targetUserId} messageId={modal.messageId} serverId={modal.serverId} />;
    case "notifications":
      return <NotificationsModal />;
    case "memberRoles":
      return <MemberRolesModal userId={modal.userId} />;
    case "appeal":
      return <AppealModal />;
    case "newDm":
      return <NewDmModal />;
    case "keyboard":
      return <KeyboardModal />;
    default:
      return null;
  }
}
