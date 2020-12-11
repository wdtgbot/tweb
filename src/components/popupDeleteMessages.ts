import appChatsManager from "../lib/appManagers/appChatsManager";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import rootScope from "../lib/rootScope";
import { PopupButton } from "./popup";
import PopupPeer from "./popupPeer";

export default class PopupDeleteMessages {
  constructor(mids: number[], onConfirm?: () => void) {
    const peerId = appMessagesManager.getMessage(mids[0]).peerId;
    const firstName = appPeersManager.getPeerTitle(peerId, false, true);

    mids = mids.slice();
    const callback = (revoke: boolean) => {
      onConfirm && onConfirm();
      appMessagesManager.deleteMessages(mids, revoke);
    };

    let title: string, description: string, buttons: PopupButton[];
    title = `Delete ${mids.length == 1 ? '' : mids.length + ' '}Message${mids.length == 1 ? '' : 's'}?`;
    description = `Are you sure you want to delete ${mids.length == 1 ? 'this message' : 'these messages'}?`;

    if(peerId == rootScope.myId) {
      buttons = [{
        text: 'DELETE',
        isDanger: true,
        callback: () => callback(false)
      }];
    } else {
      buttons = [{
        text: 'DELETE JUST FOR ME',
        isDanger: true,
        callback: () => callback(false)
      }];

      if(peerId > 0) {
        buttons.push({
          text: 'DELETE FOR ME AND ' + firstName,
          isDanger: true,
          callback: () => callback(true)
        });
      } else {
        const chat = appChatsManager.getChat(-peerId);

        const hasRights = appChatsManager.hasRights(-peerId, 'deleteRevoke');
        if(chat._ == 'chat') {
          const canRevoke = hasRights ? mids.slice() : mids.filter(mid => {
            const message = appMessagesManager.getMessage(mid);
            return message.fromId == rootScope.myId;
          });

          if(canRevoke.length) {
            if(canRevoke.length == mids.length) {
              buttons.push({
                text: 'DELETE FOR ALL',
                isDanger: true,
                callback: () => callback(true)
              });
            } else {
              const buttonText = 'Unsend my and delete';
              buttons.push({
                text: buttonText,
                isDanger: true,
                callback: () => callback(true)
              });
  
              description = `You can also delete the ${canRevoke.length} message${canRevoke.length > 1 ? 's' : ''} you sent from the inboxes of other group members by pressing "${buttonText}".`;
            }
          }
        } else {
          if(!hasRights || appChatsManager.isBroadcast(-peerId)) {
            buttons.shift();
          }

          buttons.push({
            text: 'DELETE FOR ALL',
            isDanger: true,
            callback: () => callback(true)
          });
        }
      }
    }

    buttons.push({
      text: 'CANCEL',
      isCancel: true
    });

    const popup = new PopupPeer('popup-delete-chat', {
      peerId,
      title,
      description,
      buttons
    });

    popup.show();
  }
}