import { isEqual } from 'lodash';
import { IronListElement } from '@polymer/iron-list';
import mergeGroups from './group';

import {
  createMessageItem,
  fillGroupsList,
  initialiseAutocompleteBashTags,
  initialiseAutocompleteFilenames,
  initialiseGroupsEditor,
  updateGroupsEditorState,
  initialiseVirtualLists,
  updateSelectedGame
} from './dom';
import Filters from './filters';
import { Plugin } from './plugin';
import Translator from './translator';
import {
  GameContent,
  GameData,
  PluginContent,
  SimpleMessage,
  SourcedGroup,
  Masterlist,
  GameGroups,
  DerivedPluginMetadata
} from './interfaces';

interface GamePluginsChangeEvent extends CustomEvent {
  detail: {
    valuesAreTotals: boolean;
    totalMessageNo: number;
    warnMessageNo: number;
    errorMessageNo: number;
    totalPluginNo: number;
    activePluginNo: number;
    dirtyPluginNo: number;
  };
}

interface GameGlobalMessagesChangeEvent extends CustomEvent {
  detail: {
    totalDiff: number;
    warningDiff: number;
    errorDiff: number;
    messages: SimpleMessage[];
  };
}

interface GameMasterlistChangeEvent extends CustomEvent {
  detail: {
    revision: string;
    date: string;
  };
}

interface GameGroupsChangeEvent extends CustomEvent {
  detail: { groups: SourcedGroup[] };
}

export default class Game {
  private _folder: string;

  private _generalMessages: SimpleMessage[];

  private _masterlist: Masterlist;

  private _plugins: Plugin[];

  private _groups: SourcedGroup[];

  private bashTags: string[];

  public oldLoadOrder: Plugin[];

  private _notApplicableString: string;

  public constructor(obj: GameData, l10n: Translator) {
    this.folder = obj.folder || '';
    this.generalMessages = obj.generalMessages || [];
    this.masterlist = obj.masterlist || { revision: '', date: '' };
    this.plugins = obj.plugins ? obj.plugins.map(p => new Plugin(p)) : [];
    this.bashTags = obj.bashTags || [];
    this.setGroups(obj.groups);

    this.oldLoadOrder = undefined;

    this._notApplicableString = l10n.translate('N/A');
  }

  public get folder(): string {
    return this._folder;
  }

  public set folder(folder) {
    if (folder !== this._folder) {
      document.dispatchEvent(
        new CustomEvent('loot-game-folder-change', {
          detail: { folder }
        })
      );
    }

    this._folder = folder;
  }

  public get generalMessages(): SimpleMessage[] {
    return this._generalMessages;
  }

  public set generalMessages(generalMessages) {
    /* Update the message counts. */
    let oldTotal = 0;
    let newTotal = 0;
    let oldWarns = 0;
    let newWarns = 0;
    let oldErrs = 0;
    let newErrs = 0;

    if (this._generalMessages) {
      oldTotal = this._generalMessages.length;
      this._generalMessages.forEach(message => {
        if (message.type === 'warn') {
          oldWarns += 1;
        } else if (message.type === 'error') {
          oldErrs += 1;
        }
      });
    }

    if (generalMessages) {
      newTotal = generalMessages.length;

      generalMessages.forEach(message => {
        if (message.type === 'warn') {
          newWarns += 1;
        } else if (message.type === 'error') {
          newErrs += 1;
        }
      });
    }

    if (
      newTotal !== oldTotal ||
      newWarns !== oldWarns ||
      newErrs !== oldErrs ||
      !isEqual(this._generalMessages, generalMessages)
    ) {
      document.dispatchEvent(
        new CustomEvent('loot-game-global-messages-change', {
          detail: {
            totalDiff: newTotal - oldTotal,
            warningDiff: newWarns - oldWarns,
            errorDiff: newErrs - oldErrs,
            messages: generalMessages
          }
        })
      );
    }

    this._generalMessages = generalMessages;
  }

  public get masterlist(): Masterlist {
    return this._masterlist;
  }

  public set masterlist(masterlist) {
    if (
      masterlist !== this._masterlist &&
      (masterlist === undefined ||
        this._masterlist === undefined ||
        masterlist.revision !== this._masterlist.revision ||
        masterlist.date !== this._masterlist.date)
    ) {
      const {
        revision = this._notApplicableString,
        date = this._notApplicableString
      } = masterlist || {};

      document.dispatchEvent(
        new CustomEvent('loot-game-masterlist-change', {
          detail: {
            revision,
            date
          }
        })
      );
    }

    this._masterlist = masterlist;
  }

  public get plugins(): Plugin[] {
    return this._plugins;
  }

  public set plugins(plugins) {
    /* Update plugin and message counts. Unlike for general messages
    it's not worth calculating the count differences, just count
    from zero. */
    let totalMessageNo = 0;
    let warnMessageNo = 0;
    let errorMessageNo = 0;
    let activePluginNo = 0;
    let dirtyPluginNo = 0;

    /* Include general messages in the count. */
    if (this.generalMessages) {
      totalMessageNo = this.generalMessages.length;
      this.generalMessages.forEach(message => {
        if (message.type === 'warn') {
          warnMessageNo += 1;
        } else if (message.type === 'error') {
          errorMessageNo += 1;
        }
      });
    }

    plugins.forEach((plugin, index) => {
      /* Recalculate each plugin card's z-index value. */
      plugin.cardZIndex = plugins.length - index;

      if (plugin.isActive) {
        activePluginNo += 1;
      }
      if (plugin.isDirty) {
        dirtyPluginNo += 1;
      }
      if (plugin.messages) {
        totalMessageNo += plugin.messages.length;
        plugin.messages.forEach(message => {
          if (message.type === 'warn') {
            warnMessageNo += 1;
          } else if (message.type === 'error') {
            errorMessageNo += 1;
          }
        });
      }
    });

    document.dispatchEvent(
      new CustomEvent('loot-game-plugins-change', {
        detail: {
          valuesAreTotals: true,
          totalMessageNo,
          warnMessageNo,
          errorMessageNo,
          totalPluginNo: plugins.length,
          activePluginNo,
          dirtyPluginNo
        }
      })
    );

    this._plugins = plugins;
  }

  public get groups(): SourcedGroup[] {
    return this._groups;
  }

  public setGroups(groups: GameGroups): void {
    if (groups) {
      this._groups = mergeGroups(groups.masterlist, groups.userlist);
    } else {
      this._groups = [
        {
          name: 'default',
          isUserAdded: false,
          after: []
        }
      ];
    }

    document.dispatchEvent(
      new CustomEvent('loot-game-groups-change', {
        detail: { groups: this._groups }
      })
    );
  }

  public getContent(): GameContent {
    let messages: SimpleMessage[] = [];
    let plugins: PluginContent[] = [];

    if (this.generalMessages) {
      messages = this.generalMessages;
    }
    if (this.plugins) {
      plugins = this.plugins.map(plugin => ({
        name: plugin.name,
        crc: plugin.crc,
        version: plugin.version,
        isActive: plugin.isActive,
        isEmpty: plugin.isEmpty,
        loadsArchive: plugin.loadsArchive,

        group: plugin.group,
        messages: plugin.messages,
        currentTags: plugin.currentTags,
        suggestedTags: plugin.suggestedTags,
        isDirty: plugin.isDirty
      }));
    }

    return {
      messages,
      plugins
    };
  }

  public getPluginNames(): string[] {
    return this.plugins.map(plugin => plugin.name);
  }

  public getGroupPluginNames(groupName: string): string[] {
    return this.plugins
      .filter(plugin => plugin.group === groupName)
      .map(plugin => plugin.name);
  }

  public setSortedPlugins(plugins: DerivedPluginMetadata[]): void {
    this.oldLoadOrder = this.plugins;

    this.plugins = plugins.map(plugin => {
      const existingPlugin = this.oldLoadOrder.find(
        item => item.name === plugin.name
      );
      if (existingPlugin) {
        existingPlugin.update(plugin);
        return existingPlugin;
      }
      return new Plugin(plugin);
    });
  }

  public applySort(): void {
    this.oldLoadOrder = undefined;
  }

  public cancelSort(
    plugins: DerivedPluginMetadata[],
    generalMessages: SimpleMessage[]
  ): void {
    this.plugins = plugins.reduce((existingPlugins, plugin) => {
      const existingPlugin = this.oldLoadOrder.find(
        item => item.name === plugin.name
      );
      if (existingPlugin) {
        existingPlugin.update(plugin);
        existingPlugins.push(existingPlugin);
      }

      return existingPlugins;
    }, []);
    this.oldLoadOrder = undefined;

    /* Update general messages */
    this.generalMessages = generalMessages;
  }

  public clearMetadata(plugins: DerivedPluginMetadata[]): void {
    /* Need to empty the UI-side user metadata. */
    plugins.forEach(plugin => {
      const existingPlugin = this.plugins.find(
        item => item.name === plugin.name
      );
      if (existingPlugin) {
        existingPlugin.update(plugin);
      }
    });
  }

  public initialiseUI(filters: Filters): void {
    /* Re-initialise autocomplete suggestions. */
    initialiseAutocompleteFilenames(this.getPluginNames());
    initialiseAutocompleteBashTags(this.bashTags);

    /* Re-initialise conflicts filter plugin list. */
    Filters.fillConflictsFilterList(this.plugins);

    initialiseGroupsEditor(groupName => this.getGroupPluginNames(groupName));

    updateSelectedGame(this.folder);

    /* Now update virtual lists. */
    if (filters.areAnyFiltersActive()) {
      /* Schedule applying the filters instead of applying them immediately.
        This improves the UI initialisation speed, and is quick enough that
        the lists aren't visible pre-filtration. */
      setTimeout(() => filters.apply(this.plugins), 0);
    } else {
      initialiseVirtualLists(this.plugins);
    }
  }

  public static onPluginsChange(evt: GamePluginsChangeEvent): void {
    if (!evt.detail.valuesAreTotals) {
      evt.detail.totalMessageNo += parseInt(
        document.getElementById('totalMessageNo').textContent,
        10
      );
      evt.detail.warnMessageNo += parseInt(
        document.getElementById('totalWarningNo').textContent,
        10
      );
      evt.detail.errorMessageNo += parseInt(
        document.getElementById('totalErrorNo').textContent,
        10
      );
      evt.detail.totalPluginNo += parseInt(
        document.getElementById('totalPluginNo').textContent,
        10
      );
      evt.detail.activePluginNo += parseInt(
        document.getElementById('activePluginNo').textContent,
        10
      );
      evt.detail.dirtyPluginNo += parseInt(
        document.getElementById('dirtyPluginNo').textContent,
        10
      );
    }

    document.getElementById(
      'filterTotalMessageNo'
    ).textContent = evt.detail.totalMessageNo.toString();
    document.getElementById(
      'totalMessageNo'
    ).textContent = evt.detail.totalMessageNo.toString();
    document.getElementById(
      'totalWarningNo'
    ).textContent = evt.detail.warnMessageNo.toString();
    document.getElementById(
      'totalErrorNo'
    ).textContent = evt.detail.errorMessageNo.toString();

    document.getElementById(
      'filterTotalPluginNo'
    ).textContent = evt.detail.totalPluginNo.toString();
    document.getElementById(
      'totalPluginNo'
    ).textContent = evt.detail.totalPluginNo.toString();
    document.getElementById(
      'activePluginNo'
    ).textContent = evt.detail.activePluginNo.toString();
    document.getElementById(
      'dirtyPluginNo'
    ).textContent = evt.detail.dirtyPluginNo.toString();
  }

  public static onGeneralMessagesChange(
    evt: GameGlobalMessagesChangeEvent
  ): void {
    document.getElementById('filterTotalMessageNo').textContent = (
      parseInt(
        document.getElementById('filterTotalMessageNo').textContent,
        10
      ) + evt.detail.totalDiff
    ).toString();
    document.getElementById('totalMessageNo').textContent = (
      parseInt(document.getElementById('totalMessageNo').textContent, 10) +
      evt.detail.totalDiff
    ).toString();
    document.getElementById('totalWarningNo').textContent = (
      parseInt(document.getElementById('totalWarningNo').textContent, 10) +
      evt.detail.warningDiff
    ).toString();
    document.getElementById('totalErrorNo').textContent = (
      parseInt(document.getElementById('totalErrorNo').textContent, 10) +
      evt.detail.errorDiff
    ).toString();

    /* Remove old messages from UI. */
    const generalMessagesList = document
      .getElementById('summary')
      .getElementsByTagName('ul')[0];
    while (generalMessagesList.firstElementChild) {
      generalMessagesList.removeChild(generalMessagesList.firstElementChild);
    }

    /* Add new messages. */
    if (evt.detail.messages) {
      evt.detail.messages.forEach(message => {
        generalMessagesList.appendChild(
          createMessageItem(message.type, message.text)
        );
      });
    }

    /* Update the plugin card list's configured offset. */
    const cardList = document.getElementById(
      'pluginCardList'
    ) as IronListElement;
    const summary = document.getElementById('summary');
    const summaryStyle = getComputedStyle(summary);

    cardList.scrollOffset =
      summary.offsetHeight +
      parseInt(summaryStyle.marginTop, 10) +
      parseInt(summaryStyle.marginBottom, 10);
  }

  public static onMasterlistChange(evt: GameMasterlistChangeEvent): void {
    document.getElementById('masterlistRevision').textContent =
      evt.detail.revision;
    document.getElementById('masterlistDate').textContent = evt.detail.date;
  }

  public static onGroupsChange(evt: GameGroupsChangeEvent): void {
    fillGroupsList(evt.detail.groups);
    updateGroupsEditorState(evt.detail.groups);
  }
}