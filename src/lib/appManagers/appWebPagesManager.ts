import appPhotosManager from "./appPhotosManager";
import appDocsManager from "./appDocsManager";
import { RichTextProcessor } from "../richtextprocessor";
import { ReferenceContext } from "../mtproto/referenceDatabase";
import rootScope from "../rootScope";
import { safeReplaceObject } from "../../helpers/object";
import { limitSymbols } from "../../helpers/string";

export class AppWebPagesManager {
  webpages: any = {};
  pendingWebPages: any = {};
  
  constructor() {
    rootScope.on('apiUpdate', (e) => {
      const update = e.detail;

      switch(update._) {
        case 'updateWebPage':
          this.saveWebPage(update.webpage);
          break;
      }
    });
  }
  
  public saveWebPage(apiWebPage: any, messageId?: number, mediaContext?: ReferenceContext) {
    if(apiWebPage.photo && apiWebPage.photo._ === 'photo') {
      //appPhotosManager.savePhoto(apiWebPage.photo, mediaContext);
      apiWebPage.photo = appPhotosManager.savePhoto(apiWebPage.photo, mediaContext);
    } else {
      delete apiWebPage.photo;
    }

    if(apiWebPage.document && apiWebPage.document._ === 'document') {
      apiWebPage.document = appDocsManager.saveDoc(apiWebPage.document, mediaContext); // warning 11.04.2020
    } else {
      if(apiWebPage.type == 'document') {
        delete apiWebPage.type;
      }

      delete apiWebPage.document;
    }
    
    const siteName = apiWebPage.site_name;
    let shortTitle = apiWebPage.title || apiWebPage.author || siteName || '';
    if(siteName && shortTitle == siteName) {
      delete apiWebPage.site_name;
    }

    shortTitle = limitSymbols(shortTitle, 80, 100);

    apiWebPage.rTitle = RichTextProcessor.wrapRichText(shortTitle, {noLinks: true, noLinebreaks: true});
    let contextHashtag = '';
    if(siteName == 'GitHub') {
      const matches = apiWebPage.url.match(/(https?:\/\/github\.com\/[^\/]+\/[^\/]+)/);
      if(matches) {
        contextHashtag = matches[0] + '/issues/{1}';
      }
    }

    // delete apiWebPage.description
    const shortDescriptionText = limitSymbols(apiWebPage.description || '', 150, 180);
    apiWebPage.rDescription = RichTextProcessor.wrapRichText(shortDescriptionText, {
      contextSite: siteName || 'external',
      contextHashtag: contextHashtag
    });
    
    if(apiWebPage.type != 'photo' &&
    apiWebPage.type != 'video' &&
    apiWebPage.type != 'gif' &&
    apiWebPage.type != 'document' &&
    !apiWebPage.description &&
    apiWebPage.photo) {
      apiWebPage.type = 'photo';
    }
    
    if(messageId) {
      if(this.pendingWebPages[apiWebPage.id] === undefined) {
        this.pendingWebPages[apiWebPage.id] = {};
      }

      this.pendingWebPages[apiWebPage.id][messageId] = true;
    }
    
    if(this.webpages[apiWebPage.id] === undefined) {
      this.webpages[apiWebPage.id] = apiWebPage;
    } else {
      safeReplaceObject(this.webpages[apiWebPage.id], apiWebPage);
    }
    
    if(!messageId && this.pendingWebPages[apiWebPage.id] !== undefined) {
      const msgs: number[] = [];
      for(let msgId in this.pendingWebPages[apiWebPage.id]) {
        msgs.push(+msgId);
      }

      rootScope.broadcast('webpage_updated', {
        id: apiWebPage.id,
        msgs: msgs
      });
    }

    return apiWebPage;
  }

  public getWebPage(id: string) {
    return this.webpages[id];
  }
}

export default new AppWebPagesManager();
