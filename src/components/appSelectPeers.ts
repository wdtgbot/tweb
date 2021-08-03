<<<<<<< HEAD
/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appChatsManager, { ChatRights } from "../lib/appManagers/appChatsManager";
import appDialogsManager from "../lib/appManagers/appDialogsManager";
import appMessagesManager, { Dialog } from "../lib/appManagers/appMessagesManager";
import appPhotosManager from "../lib/appManagers/appPhotosManager";
import appUsersManager from "../lib/appManagers/appUsersManager";
import rootScope from "../lib/rootScope";
import Scrollable from "./scrollable";
import { FocusDirection } from "../helpers/fastSmoothScroll";
import CheckboxField from "./checkboxField";
import appProfileManager from "../lib/appManagers/appProfileManager";
import { safeAssign } from "../helpers/object";
import { i18n, LangPackKey, _i18n } from "../lib/langPack";
import findUpAttribute from "../helpers/dom/findUpAttribute";
import findUpClassName from "../helpers/dom/findUpClassName";
import PeerTitle from "./peerTitle";
import { cancelEvent } from "../helpers/dom/cancelEvent";
import replaceContent from "../helpers/dom/replaceContent";
import { filterUnique } from "../helpers/array";
import debounce from "../helpers/schedulers/debounce";

type PeerType = 'contacts' | 'dialogs' | 'channelParticipants';

// TODO: правильная сортировка для addMembers, т.е. для peerType: 'contacts', потому что там идут сначала контакты - потом неконтакты, а должно всё сортироваться по имени

let loadedAllDialogs = false, loadAllDialogsPromise: Promise<any>;
export default class AppSelectPeers {
  public container = document.createElement('div');
  public list = appDialogsManager.createChatList(/* {
    handheldsSize: 66,
    avatarSize: 48
  } */);
  public chatsContainer = document.createElement('div');
  public scrollable: Scrollable;
  public selectedScrollable: Scrollable;
  
  public selectedContainer: HTMLElement;
  public input: HTMLInputElement;
  
  //public selected: {[peerId: number]: HTMLElement} = {};
  public selected = new Set<any>();

  public freezed = false;

  private folderId = 0;
  private offsetIndex = 0;
  private promise: Promise<any>;

  private query = '';
  private cachedContacts: number[];

  private loadedWhat: Partial<{[k in 'dialogs' | 'archived' | 'contacts' | 'channelParticipants']: true}> = {};

  private renderedPeerIds: Set<number> = new Set();

  private appendTo: HTMLElement;
  private onChange: (length: number) => void;
  private peerType: PeerType[] = ['dialogs'];
  private renderResultsFunc: (peerIds: number[]) => void;
  private chatRightsAction: ChatRights;
  private multiSelect = true;
  private rippleEnabled = true;
  private avatarSize = 48;

  private tempIds: {[k in keyof AppSelectPeers['loadedWhat']]: number} = {};
  private peerId = 0;

  private placeholder: LangPackKey;

  private selfPresence: LangPackKey = 'Presence.YourChat';
  
  private needSwitchList = false;
  
  constructor(options: {
    appendTo: AppSelectPeers['appendTo'], 
    onChange?: AppSelectPeers['onChange'], 
    peerType?: AppSelectPeers['peerType'], 
    peerId?: number,
    onFirstRender?: () => void, 
    renderResultsFunc?: AppSelectPeers['renderResultsFunc'], 
    chatRightsAction?: AppSelectPeers['chatRightsAction'], 
    multiSelect?: AppSelectPeers['multiSelect'],
    rippleEnabled?: boolean,
    avatarSize?: AppSelectPeers['avatarSize'],
    placeholder?: LangPackKey,
    selfPresence?: LangPackKey
  }) {
    safeAssign(this, options);

    this.container.classList.add('selector');

    const f = (this.renderResultsFunc || this.renderResults).bind(this);
    this.renderResultsFunc = (peerIds: number[]) => {
      if(this.needSwitchList) {
        this.scrollable.splitUp.replaceWith(this.list);
        this.scrollable.setVirtualContainer(this.list);
        this.needSwitchList = false;
      }
      
      peerIds = peerIds.filter(peerId => {
        const notRendered = !this.renderedPeerIds.has(peerId);
        if(notRendered) this.renderedPeerIds.add(peerId);
        return notRendered;
      });

      return f(peerIds);
    };

    this.input = document.createElement('input');
    this.input.classList.add('selector-search-input');
    if(this.placeholder) {
      _i18n(this.input, this.placeholder, undefined, 'placeholder');
    } else {
      _i18n(this.input, 'SendMessageTo', undefined, 'placeholder');
    }

    this.input.type = 'text';

    if(this.multiSelect) {
      let topContainer = document.createElement('div');
      topContainer.classList.add('selector-search-container');
  
      this.selectedContainer = document.createElement('div');
      this.selectedContainer.classList.add('selector-search');
      
      this.selectedContainer.append(this.input);
      topContainer.append(this.selectedContainer);
      this.selectedScrollable = new Scrollable(topContainer);
  
      let delimiter = document.createElement('hr');

      this.selectedContainer.addEventListener('click', (e) => {
        if(this.freezed) return;
        let target = e.target as HTMLElement;
        target = findUpClassName(target, 'selector-user');
  
        if(!target) return;
  
        const peerId = target.dataset.key;
        const li = this.chatsContainer.querySelector('[data-peer-id="' + peerId + '"]') as HTMLElement;
        if(!li) {
          this.remove(+peerId || peerId);
        } else {
          li.click();
        }
      });

      this.container.append(topContainer, delimiter);
    }

    this.chatsContainer.classList.add('chatlist-container');
    this.chatsContainer.append(this.list);
    this.scrollable = new Scrollable(this.chatsContainer);
    this.scrollable.setVirtualContainer(this.list);

    this.chatsContainer.addEventListener('click', (e) => {
      const target = findUpAttribute(e.target, 'data-peer-id') as HTMLElement;
      cancelEvent(e);

      if(!target) return;
      if(this.freezed) return;

      let key: any = target.dataset.peerId;
      key = +key || key;

      if(!this.multiSelect) {
        this.add(key);
        return;
      }

      //target.classList.toggle('active');
      if(this.selected.has(key)) {
        this.remove(key);
      } else {
        this.add(key);
      }

      const checkbox = target.querySelector('input') as HTMLInputElement;
      checkbox.checked = !checkbox.checked;
    });

    const debouncedInput = debounce(this.onInput, 200, false, true);
    this.input.addEventListener('input', debouncedInput);

    this.scrollable.onScrolledBottom = () => {
      this.getMoreResults();
    };

    this.container.append(this.chatsContainer);
    this.appendTo.append(this.container);

    // WARNING TIMEOUT
    setTimeout(() => {
      let getResultsPromise = this.getMoreResults() as Promise<any>;
      if(options.onFirstRender) {
        getResultsPromise.then(() => {
          options.onFirstRender();
        });
      }
    }, 0);
  }

  private onInput = () => {
    const value = this.input.value;
    if(this.query !== value) {
      if(this.peerType.includes('contacts')) {
        this.cachedContacts = null;
      }
      
      if(this.peerType.includes('dialogs')) {
        this.folderId = 0;
        this.offsetIndex = 0;
      }

      for(let i in this.tempIds) {
        // @ts-ignore
        ++this.tempIds[i];
      }

      this.list = appDialogsManager.createChatList();

      this.promise = null;
      this.loadedWhat = {};
      this.query = value;
      this.renderedPeerIds.clear();
      this.needSwitchList = true;
      
      //console.log('selectPeers input:', this.query);
      this.getMoreResults();
    }
  };

  private renderSaved() {
    if(!this.offsetIndex && this.folderId === 0 && this.peerType.includes('dialogs') && (!this.query || appUsersManager.testSelfSearch(this.query))) {
      this.renderResultsFunc([rootScope.myId]);
    }
  }

  private getTempId(type: keyof AppSelectPeers['tempIds']) {
    if(this.tempIds[type] === undefined) {
      this.tempIds[type] = 0;
    }

    return ++this.tempIds[type];
  }

  private async getMoreDialogs(): Promise<any> {
    if(this.promise) return this.promise;

    if(this.loadedWhat.dialogs && this.loadedWhat.archived) {
      return;
    }
    
    // в десктопе - сначала без группы, потом архивные, потом контакты без сообщений
    const pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;

    const tempId = this.getTempId('dialogs');
    const promise = appMessagesManager.getConversations(this.query, this.offsetIndex, pageCount, this.folderId);
    this.promise = promise;
    const value = await promise;
    if(this.tempIds.dialogs !== tempId) {
      return;
    }

    this.promise = null;

    let dialogs = value.dialogs as Dialog[];
    if(dialogs.length) {
      const newOffsetIndex = dialogs[dialogs.length - 1].index || 0;

      dialogs = dialogs.slice();
      dialogs.findAndSplice(d => d.peerId === rootScope.myId); // no my account

      if(this.chatRightsAction) {
        dialogs = dialogs.filter(d => this.filterByRights(d.peerId));
      }

      this.renderSaved();

      this.offsetIndex = newOffsetIndex;

      this.renderResultsFunc(dialogs.map(dialog => dialog.peerId));
    }
    
    if(value.isEnd) {
      if(!this.loadedWhat.dialogs) {
        this.renderSaved();

        this.loadedWhat.dialogs = true;
        this.offsetIndex = 0;
        this.folderId = 1;

        return this.getMoreDialogs();
      } else {
        this.loadedWhat.archived = true;

        if(!this.loadedWhat.contacts && this.peerType.includes('contacts')) {
          return this.getMoreContacts();
        }
      }
    }
  }

  private filterByRights(peerId: number) {
    return (
      peerId > 0 && 
      (this.chatRightsAction !== 'send_messages' || appUsersManager.canSendToUser(peerId))
    ) || appChatsManager.hasRights(-peerId, this.chatRightsAction);
  }

  private async getMoreContacts() {
    if(this.promise) return this.promise;

    if(this.loadedWhat.contacts) {
      return;
    }

    if(!this.cachedContacts) {
      /* const promises: Promise<any>[] = [appUsersManager.getContacts(this.query)];
      if(!this.peerType.includes('dialogs')) {
        promises.push(appMessagesManager.getConversationsAll());
      }

      this.promise = Promise.all(promises);
      this.cachedContacts = (await this.promise)[0].slice(); */
      const tempId = this.getTempId('contacts');
      const promise = Promise.all([
        appUsersManager.getContacts(this.query),
        this.query ? appUsersManager.searchContacts(this.query) : undefined
      ]);

      this.promise = promise;
      const [cachedContacts, searchResult] = await promise;
      if(this.tempIds.contacts !== tempId) {
        return;
      }

      if(searchResult) {
        let resultPeerIds = searchResult.my_results.concat(searchResult.results);

        if(this.chatRightsAction) {
          resultPeerIds = resultPeerIds.filter(peerId => this.filterByRights(peerId));
        }

        if(!this.peerType.includes('dialogs')) {
          resultPeerIds = resultPeerIds.filter(peerId => peerId > 0);
        }

        this.cachedContacts = filterUnique(cachedContacts.concat(resultPeerIds));
      } else this.cachedContacts = cachedContacts.slice();

      this.cachedContacts.findAndSplice(userId => userId === rootScope.myId); // no my account
      this.promise = null;
    }

    if(this.cachedContacts.length) {
      const pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
      const arr = this.cachedContacts.splice(0, pageCount);
      this.renderResultsFunc(arr);
    }
    
    if(!this.cachedContacts.length) {
      this.loadedWhat.contacts = true;

      // need to load non-contacts
      /* if(!this.peerType.includes('dialogs')) {
        return this.getMoreDialogs();
      } */
    }
  }

  private async getMoreChannelParticipants() {
    if(this.promise) return this.promise;

    if(this.loadedWhat.channelParticipants) {
      return;
    }

    const pageCount = 50; // same as in group permissions to use cache

    const tempId = this.getTempId('channelParticipants');
    const promise = appProfileManager.getChannelParticipants(-this.peerId, {_: 'channelParticipantsSearch', q: this.query}, pageCount, this.list.childElementCount);
    const participants = await promise;
    if(this.tempIds.channelParticipants !== tempId) {
      return;
    }
    
    const peerIds = participants.participants.map(participant => {
      return appChatsManager.getParticipantPeerId(participant);
    });
    peerIds.findAndSplice(u => u === rootScope.myId);
    this.renderResultsFunc(peerIds);

    if(this.list.childElementCount >= participants.count || participants.participants.length < pageCount) {
      this.loadedWhat.channelParticipants = true;
    }
  }

  checkForTriggers = () => {
    this.scrollable.checkForTriggers();
  };

  private getMoreResults() {
    const get = () => {
      const promises: Promise<any>[] = [];

      if(!loadedAllDialogs && (this.peerType.includes('dialogs')/*  || this.peerType.includes('contacts') */)) {
        if(!loadAllDialogsPromise) {
          loadAllDialogsPromise = appMessagesManager.getConversationsAll()
          .then(() => {
            loadedAllDialogs = true;
          }).finally(() => {
            loadAllDialogsPromise = null;
          });
        }

        promises.push(loadAllDialogsPromise);
      }
  
      if((this.peerType.includes('dialogs')/*  || this.loadedWhat.contacts */) && !this.loadedWhat.archived) { // to load non-contacts
        promises.push(this.getMoreDialogs());
  
        if(!this.loadedWhat.archived) {
          return promises;
        }
      }
      
      if(this.peerType.includes('contacts') && !this.loadedWhat.contacts) {
        promises.push(this.getMoreContacts());
      }

      if(this.peerType.includes('channelParticipants') && !this.loadedWhat.channelParticipants) {
        promises.push(this.getMoreChannelParticipants());
      }
  
      return promises;
    };
    
    const promises = get();
    const promise = Promise.all(promises);
    if(promises.length) {
      promise.then(this.checkForTriggers);
    }

    return promise;
  }

  private renderResults(peerIds: number[]) {
    //console.log('will renderResults:', peerIds);

    // оставим только неконтакты с диалогов
    if(!this.peerType.includes('dialogs') && this.loadedWhat.contacts) {
      peerIds = peerIds.filter(peerId => {
        return appUsersManager.isNonContactUser(peerId);
      });
    }

    peerIds.forEach(peerId => {
      const {dom} = appDialogsManager.addDialogNew({
        dialog: peerId,
        container: this.scrollable,
        drawStatus: false,
        rippleEnabled: this.rippleEnabled,
        avatarSize: this.avatarSize
      });

      if(this.multiSelect) {
        const selected = this.selected.has(peerId);
        const checkboxField = new CheckboxField();

        if(selected) {
          //dom.listEl.classList.add('active');
          checkboxField.input.checked = true;
        }

        dom.containerEl.prepend(checkboxField.label);
      }

      let subtitleEl: HTMLElement;
      if(peerId < 0) {
        subtitleEl = appProfileManager.getChatMembersString(-peerId);
      } else if(peerId === rootScope.myId) {
        subtitleEl = i18n(this.selfPresence);
      } else {
        subtitleEl = appUsersManager.getUserStatusString(peerId);
      }

      dom.lastMessageSpan.append(subtitleEl);
    });
  }

  public add(peerId: any, title?: string | HTMLElement, scroll = true) {
    //console.trace('add');
    this.selected.add(peerId);

    if(!this.multiSelect) {
      this.onChange(this.selected.size);
      return;
    }

    if(this.query.trim()) {
      this.input.value = '';
      this.onInput();
    }

    const div = document.createElement('div');
    div.classList.add('selector-user', 'scale-in');

    const avatarEl = document.createElement('avatar-element');
    avatarEl.classList.add('selector-user-avatar', 'tgico');
    avatarEl.setAttribute('dialog', '1');
    avatarEl.classList.add('avatar-32');

    div.dataset.key = '' + peerId;
    if(typeof(peerId) === 'number') {
      if(title === undefined) {
        title = new PeerTitle({peerId, onlyFirstName: true, dialog: true}).element;
      }

      avatarEl.setAttribute('peer', '' + peerId);
    }

    if(title) {
      if(typeof(title) === 'string') {
        div.innerHTML = title;
      } else {
        replaceContent(div, title);
        div.append(title);
      }
    }

    div.insertAdjacentElement('afterbegin', avatarEl);

    this.selectedContainer.insertBefore(div, this.input);
    //this.selectedScrollable.scrollTop = this.selectedScrollable.scrollHeight;
    this.onChange && this.onChange(this.selected.size);
    
    if(scroll) {
      this.selectedScrollable.scrollIntoViewNew(this.input, 'center');
    }
    
    return div;
  }

  public remove(key: any) {
    if(!this.multiSelect) return;
    //const div = this.selected[peerId];
    const div = this.selectedContainer.querySelector(`[data-key="${key}"]`) as HTMLElement;
    div.classList.remove('scale-in');
    void div.offsetWidth;
    div.classList.add('scale-out');

    const onAnimationEnd = () => {
      this.selected.delete(key);
      div.remove();
      this.onChange && this.onChange(this.selected.size);
    };

    if(rootScope.settings.animationsEnabled) {
      div.addEventListener('animationend', onAnimationEnd, {once: true});
    } else {
      onAnimationEnd();
    }
  }

  public getSelected() {
    return [...this.selected];
  }

  public addInitial(values: any[]) {
    values.forEach(value => {
      this.add(value, undefined, false);
    });

    window.requestAnimationFrame(() => { // ! not the best place for this raf though it works
      this.selectedScrollable.scrollIntoViewNew(this.input, 'center', undefined, undefined, FocusDirection.Static);
    });
  }
}
=======
/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appChatsManager, { ChatRights } from "../lib/appManagers/appChatsManager";
import appDialogsManager from "../lib/appManagers/appDialogsManager";
import appMessagesManager, { Dialog } from "../lib/appManagers/appMessagesManager";
import appPhotosManager from "../lib/appManagers/appPhotosManager";
import appUsersManager from "../lib/appManagers/appUsersManager";
import rootScope from "../lib/rootScope";
import Scrollable from "./scrollable";
import { FocusDirection } from "../helpers/fastSmoothScroll";
import CheckboxField from "./checkboxField";
import appProfileManager from "../lib/appManagers/appProfileManager";
import { safeAssign } from "../helpers/object";
import { i18n, LangPackKey, _i18n } from "../lib/langPack";
import findUpAttribute from "../helpers/dom/findUpAttribute";
import findUpClassName from "../helpers/dom/findUpClassName";
import PeerTitle from "./peerTitle";
import { cancelEvent } from "../helpers/dom/cancelEvent";
import replaceContent from "../helpers/dom/replaceContent";
import { filterUnique } from "../helpers/array";
import debounce from "../helpers/schedulers/debounce";

type PeerType = 'contacts' | 'dialogs' | 'channelParticipants';

// TODO: правильная сортировка для addMembers, т.е. для peerType: 'contacts', потому что там идут сначала контакты - потом неконтакты, а должно всё сортироваться по имени

let loadedAllDialogs = false, loadAllDialogsPromise: Promise<any>;
export default class AppSelectPeers {
  public container = document.createElement('div');
  public list = appDialogsManager.createChatList(/* {
    handheldsSize: 66,
    avatarSize: 48
  } */);
  public chatsContainer = document.createElement('div');
  public scrollable: Scrollable;
  public selectedScrollable: Scrollable;
  
  public selectedContainer: HTMLElement;
  public input: HTMLInputElement;
  
  //public selected: {[peerId: number]: HTMLElement} = {};
  public selected = new Set<any>();

  public freezed = false;

  private folderId = 0;
  private offsetIndex = 0;
  private promise: Promise<any>;

  private query = '';
  private cachedContacts: number[];

  private loadedWhat: Partial<{[k in 'dialogs' | 'archived' | 'contacts' | 'channelParticipants']: true}> = {};

  private renderedPeerIds: Set<number> = new Set();

  private appendTo: HTMLElement;
  private onChange: (length: number) => void;
  private peerType: PeerType[] = ['dialogs'];
  private renderResultsFunc: (peerIds: number[]) => void;
  private chatRightsAction: ChatRights;
  private multiSelect = true;
  private rippleEnabled = true;
  private avatarSize = 48;

  private tempIds: {[k in keyof AppSelectPeers['loadedWhat']]: number} = {};
  private peerId = 0;

  private placeholder: LangPackKey;

  private selfPresence: LangPackKey = 'Presence.YourChat';
  
  private needSwitchList = false;
  
  constructor(options: {
    appendTo: AppSelectPeers['appendTo'], 
    onChange?: AppSelectPeers['onChange'], 
    peerType?: AppSelectPeers['peerType'], 
    peerId?: number,
    onFirstRender?: () => void, 
    renderResultsFunc?: AppSelectPeers['renderResultsFunc'], 
    chatRightsAction?: AppSelectPeers['chatRightsAction'], 
    multiSelect?: AppSelectPeers['multiSelect'],
    rippleEnabled?: boolean,
    avatarSize?: AppSelectPeers['avatarSize'],
    placeholder?: LangPackKey,
    selfPresence?: LangPackKey
  }) {
    safeAssign(this, options);

    this.container.classList.add('selector');

    const f = (this.renderResultsFunc || this.renderResults).bind(this);
    this.renderResultsFunc = (peerIds: number[]) => {
      if(this.needSwitchList) {
        this.scrollable.splitUp.replaceWith(this.list);
        this.scrollable.setVirtualContainer(this.list);
        this.needSwitchList = false;
      }
      
      peerIds = peerIds.filter(peerId => {
        const notRendered = !this.renderedPeerIds.has(peerId);
        if(notRendered) this.renderedPeerIds.add(peerId);
        return notRendered;
      });

      return f(peerIds);
    };

    this.input = document.createElement('input');
    this.input.classList.add('selector-search-input');
    if(this.placeholder) {
      _i18n(this.input, this.placeholder, undefined, 'placeholder');
    } else {
      _i18n(this.input, 'SendMessageTo', undefined, 'placeholder');
    }

    this.input.type = 'text';

    if(this.multiSelect) {
      let topContainer = document.createElement('div');
      topContainer.classList.add('selector-search-container');
  
      this.selectedContainer = document.createElement('div');
      this.selectedContainer.classList.add('selector-search');
      
      this.selectedContainer.append(this.input);
      topContainer.append(this.selectedContainer);
      this.selectedScrollable = new Scrollable(topContainer);
  
      let delimiter = document.createElement('hr');

      this.selectedContainer.addEventListener('click', (e) => {
        if(this.freezed) return;
        let target = e.target as HTMLElement;
        target = findUpClassName(target, 'selector-user');
  
        if(!target) return;
  
        const peerId = target.dataset.key;
        const li = this.chatsContainer.querySelector('[data-peer-id="' + peerId + '"]') as HTMLElement;
        if(!li) {
          this.remove(+peerId || peerId);
        } else {
          li.click();
        }
      });

      this.container.append(topContainer, delimiter);
    }

    this.chatsContainer.classList.add('chatlist-container');
    this.chatsContainer.append(this.list);
    this.scrollable = new Scrollable(this.chatsContainer);
    this.scrollable.setVirtualContainer(this.list);

    this.chatsContainer.addEventListener('click', (e) => {
      const target = findUpAttribute(e.target, 'data-peer-id') as HTMLElement;
      cancelEvent(e);

      if(!target) return;
      if(this.freezed) return;

      let key: any = target.dataset.peerId;
      key = +key || key;

      if(!this.multiSelect) {
        this.add(key);
        return;
      }

      //target.classList.toggle('active');
      if(this.selected.has(key)) {
        this.remove(key);
      } else {
        this.add(key);
      }

      const checkbox = target.querySelector('input') as HTMLInputElement;
      checkbox.checked = !checkbox.checked;
    });

    const debouncedInput = debounce(this.onInput, 200, false, true);
    this.input.addEventListener('input', debouncedInput);

    this.scrollable.onScrolledBottom = () => {
      this.getMoreResults();
    };

    this.container.append(this.chatsContainer);
    this.appendTo.append(this.container);

    // WARNING TIMEOUT
    setTimeout(() => {
      let getResultsPromise = this.getMoreResults() as Promise<any>;
      if(options.onFirstRender) {
        getResultsPromise.then(() => {
          options.onFirstRender();
        });
      }
    }, 0);
  }

  private onInput = () => {
    const value = this.input.value;
    if(this.query !== value) {
      if(this.peerType.includes('contacts')) {
        this.cachedContacts = null;
      }
      
      if(this.peerType.includes('dialogs')) {
        this.folderId = 0;
        this.offsetIndex = 0;
      }

      for(let i in this.tempIds) {
        // @ts-ignore
        ++this.tempIds[i];
      }

      this.list = appDialogsManager.createChatList();

      this.promise = null;
      this.loadedWhat = {};
      this.query = value;
      this.renderedPeerIds.clear();
      this.needSwitchList = true;
      
      //console.log('selectPeers input:', this.query);
      this.getMoreResults();
    }
  };

  private renderSaved() {
    if(!this.offsetIndex && this.folderId === 0 && this.peerType.includes('dialogs') && (!this.query || appUsersManager.testSelfSearch(this.query))) {
      this.renderResultsFunc([rootScope.myId]);
    }
  }

  private getTempId(type: keyof AppSelectPeers['tempIds']) {
    if(this.tempIds[type] === undefined) {
      this.tempIds[type] = 0;
    }

    return ++this.tempIds[type];
  }

  private async getMoreDialogs(): Promise<any> {
    if(this.promise) return this.promise;

    if(this.loadedWhat.dialogs && this.loadedWhat.archived) {
      return;
    }
    
    // в десктопе - сначала без группы, потом архивные, потом контакты без сообщений
    const pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;

    const tempId = this.getTempId('dialogs');
    const promise = appMessagesManager.getConversations(this.query, this.offsetIndex, pageCount, this.folderId);
    this.promise = promise;
    const value = await promise;
    if(this.tempIds.dialogs !== tempId) {
      return;
    }

    this.promise = null;

    let dialogs = value.dialogs as Dialog[];
    if(dialogs.length) {
      const newOffsetIndex = dialogs[dialogs.length - 1].index || 0;

      dialogs = dialogs.slice();
      dialogs.findAndSplice(d => d.peerId === rootScope.myId); // no my account

      if(this.chatRightsAction) {
        dialogs = dialogs.filter(d => this.filterByRights(d.peerId));
      }

      this.renderSaved();

      this.offsetIndex = newOffsetIndex;

      this.renderResultsFunc(dialogs.map(dialog => dialog.peerId));
    }
    
    if(value.isEnd) {
      if(!this.loadedWhat.dialogs) {
        this.renderSaved();

        this.loadedWhat.dialogs = true;
        this.offsetIndex = 0;
        this.folderId = 1;

        return this.getMoreDialogs();
      } else {
        this.loadedWhat.archived = true;

        if(!this.loadedWhat.contacts && this.peerType.includes('contacts')) {
          return this.getMoreContacts();
        }
      }
    }
  }

  private filterByRights(peerId: number) {
    return (
      peerId > 0 && 
      (this.chatRightsAction !== 'send_messages' || appUsersManager.canSendToUser(peerId))
    ) || appChatsManager.hasRights(-peerId, this.chatRightsAction);
  }

  private async getMoreContacts() {
    if(this.promise) return this.promise;

    if(this.loadedWhat.contacts) {
      return;
    }

    if(!this.cachedContacts) {
      /* const promises: Promise<any>[] = [appUsersManager.getContacts(this.query)];
      if(!this.peerType.includes('dialogs')) {
        promises.push(appMessagesManager.getConversationsAll());
      }

      this.promise = Promise.all(promises);
      this.cachedContacts = (await this.promise)[0].slice(); */
      const tempId = this.getTempId('contacts');
      const promise = Promise.all([
        appUsersManager.getContacts(this.query),
        this.query ? appUsersManager.searchContacts(this.query) : undefined
      ]);

      this.promise = promise;
      const [cachedContacts, searchResult] = await promise;
      if(this.tempIds.contacts !== tempId) {
        return;
      }

      if(searchResult) {
        let resultPeerIds = searchResult.my_results.concat(searchResult.results);

        if(this.chatRightsAction) {
          resultPeerIds = resultPeerIds.filter(peerId => this.filterByRights(peerId));
        }

        if(!this.peerType.includes('dialogs')) {
          resultPeerIds = resultPeerIds.filter(peerId => peerId > 0);
        }

        this.cachedContacts = filterUnique(cachedContacts.concat(resultPeerIds));
      } else this.cachedContacts = cachedContacts.slice();

      this.cachedContacts.findAndSplice(userId => userId === rootScope.myId); // no my account
      this.promise = null;
    }

    if(this.cachedContacts.length) {
      const pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
      const arr = this.cachedContacts.splice(0, pageCount);
      this.renderResultsFunc(arr);
    }
    
    if(!this.cachedContacts.length) {
      this.loadedWhat.contacts = true;

      // need to load non-contacts
      /* if(!this.peerType.includes('dialogs')) {
        return this.getMoreDialogs();
      } */
    }
  }

  private async getMoreChannelParticipants() {
    if(this.promise) return this.promise;

    if(this.loadedWhat.channelParticipants) {
      return;
    }

    const pageCount = 50; // same as in group permissions to use cache

    const tempId = this.getTempId('channelParticipants');
    const promise = appProfileManager.getChannelParticipants(-this.peerId, {_: 'channelParticipantsSearch', q: this.query}, pageCount, this.list.childElementCount);
    const participants = await promise;
    if(this.tempIds.channelParticipants !== tempId) {
      return;
    }
    
    const peerIds = participants.participants.map(participant => {
      return appChatsManager.getParticipantPeerId(participant);
    });
    peerIds.findAndSplice(u => u === rootScope.myId);
    this.renderResultsFunc(peerIds);

    if(this.list.childElementCount >= participants.count || participants.participants.length < pageCount) {
      this.loadedWhat.channelParticipants = true;
    }
  }

  checkForTriggers = () => {
    this.scrollable.checkForTriggers();
  };

  private getMoreResults() {
    const get = () => {
      const promises: Promise<any>[] = [];

      if(!loadedAllDialogs && (this.peerType.includes('dialogs')/*  || this.peerType.includes('contacts') */)) {
        if(!loadAllDialogsPromise) {
          loadAllDialogsPromise = appMessagesManager.getConversationsAll()
          .then(() => {
            loadedAllDialogs = true;
          }).finally(() => {
            loadAllDialogsPromise = null;
          });
        }

        promises.push(loadAllDialogsPromise);
      }
  
      if((this.peerType.includes('dialogs')/*  || this.loadedWhat.contacts */) && !this.loadedWhat.archived) { // to load non-contacts
        promises.push(this.getMoreDialogs());
  
        if(!this.loadedWhat.archived) {
          return promises;
        }
      }
      
      if(this.peerType.includes('contacts') && !this.loadedWhat.contacts) {
        promises.push(this.getMoreContacts());
      }

      if(this.peerType.includes('channelParticipants') && !this.loadedWhat.channelParticipants) {
        promises.push(this.getMoreChannelParticipants());
      }
  
      return promises;
    };
    
    const promises = get();
    const promise = Promise.all(promises);
    if(promises.length) {
      promise.then(this.checkForTriggers);
    }

    return promise;
  }

  private renderResults(peerIds: number[]) {
    //console.log('will renderResults:', peerIds);

    // оставим только неконтакты с диалогов
    if(!this.peerType.includes('dialogs') && this.loadedWhat.contacts) {
      peerIds = peerIds.filter(peerId => {
        return appUsersManager.isNonContactUser(peerId);
      });
    }

    peerIds.forEach(peerId => {
      const {dom} = appDialogsManager.addDialogNew({
        dialog: peerId,
        container: this.scrollable,
        drawStatus: false,
        rippleEnabled: this.rippleEnabled,
        avatarSize: this.avatarSize
      });

      if(this.multiSelect) {
        const selected = this.selected.has(peerId);
        const checkboxField = new CheckboxField();

        if(selected) {
          //dom.listEl.classList.add('active');
          checkboxField.input.checked = true;
        }

        dom.containerEl.prepend(checkboxField.label);
      }

      let subtitleEl: HTMLElement;
      if(peerId < 0) {
        subtitleEl = appProfileManager.getChatMembersString(-peerId);
      } else if(peerId === rootScope.myId) {
        subtitleEl = i18n(this.selfPresence);
      } else {
        subtitleEl = appUsersManager.getUserStatusString(peerId);
      }

      dom.lastMessageSpan.append(subtitleEl);
    });
  }

  public add(peerId: any, title?: string | HTMLElement, scroll = true) {
    //console.trace('add');
    this.selected.add(peerId);

    if(!this.multiSelect) {
      this.onChange(this.selected.size);
      return;
    }

    if(this.query.trim()) {
      this.input.value = '';
      this.onInput();
    }

    const div = document.createElement('div');
    div.classList.add('selector-user', 'scale-in');

    const avatarEl = document.createElement('avatar-element');
    avatarEl.classList.add('selector-user-avatar', 'tgico');
    avatarEl.setAttribute('dialog', '1');
    avatarEl.classList.add('avatar-32');

    div.dataset.key = '' + peerId;
    if(typeof(peerId) === 'number') {
      if(title === undefined) {
        title = new PeerTitle({peerId, onlyFirstName: true, dialog: true}).element;
      }

      avatarEl.setAttribute('peer', '' + peerId);
    }

    if(title) {
      if(typeof(title) === 'string') {
        div.innerHTML = title;
      } else {
        replaceContent(div, title);
        div.append(title);
      }
    }

    div.insertAdjacentElement('afterbegin', avatarEl);

    this.selectedContainer.insertBefore(div, this.input);
    //this.selectedScrollable.scrollTop = this.selectedScrollable.scrollHeight;
    this.onChange && this.onChange(this.selected.size);
    
    if(scroll) {
      this.selectedScrollable.scrollIntoViewNew(this.input, 'center');
    }
    
    return div;
  }

  public remove(key: any) {
    if(!this.multiSelect) return;
    //const div = this.selected[peerId];
    const div = this.selectedContainer.querySelector(`[data-key="${key}"]`) as HTMLElement;
    div.classList.remove('scale-in');
    void div.offsetWidth;
    div.classList.add('scale-out');

    const onAnimationEnd = () => {
      this.selected.delete(key);
      div.remove();
      this.onChange && this.onChange(this.selected.size);
    };

    if(rootScope.settings.animationsEnabled) {
      div.addEventListener('animationend', onAnimationEnd, {once: true});
    } else {
      onAnimationEnd();
    }
  }

  public getSelected() {
    return [...this.selected];
  }

  public addInitial(values: any[]) {
    values.forEach(value => {
      this.add(value, undefined, false);
    });

    window.requestAnimationFrame(() => { // ! not the best place for this raf though it works
      this.selectedScrollable.scrollIntoViewNew(this.input, 'center', undefined, undefined, FocusDirection.Static);
    });
  }
}
>>>>>>> a3a258651320e5e8e7903d8bfe1cb222d84de6dc
