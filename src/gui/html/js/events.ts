import * as marked from 'marked';

import { IronListElement } from '@polymer/iron-list';
import { PaperCheckboxElement } from '@polymer/paper-checkbox';
import {
  askQuestion,
  closeProgress,
  showNotification,
  showProgress
} from './dialog';
import {
  fillGroupsList,
  initialiseAutocompleteBashTags,
  updateSettingsDialog,
  enableGameOperations,
  setGameMenuItems,
  updateSelectedGame,
  enable
} from './dom';
import Game from './game';
import handlePromiseError from './handlePromiseError';
import { Plugin } from './plugin';
import query from './query';
import {
  FilterStates,
  GameContent,
  GameData,
  MainContent,
  GameSettings,
  DerivedPluginMetadata,
  GameGroups,
  GetInstalledGamesResponse
} from './interfaces';
import EditableTable from '../elements/editable-table';
import LootGroupsEditor from '../elements/loot-groups-editor';
import LootPluginCard from '../elements/loot-plugin-card';
import LootPluginItem from '../elements/loot-plugin-item';
import LootPluginEditor from '../elements/loot-plugin-editor';
import LootDropdownMenu from '../elements/loot-dropdown-menu';
import LootSearchToolbar from '../elements/loot-search-toolbar';

interface ClearAllMetadataResponse {
  plugins: DerivedPluginMetadata[];
}

interface PaperCheckboxChangeEvent extends CustomEvent {
  target: EventTarget & {
    id: keyof FilterStates;
    checked: boolean;
  };
}

interface PaperInputChangeEvent extends CustomEvent {
  target: EventTarget & { value: string };
}

interface LootDropdownMenuChangeEvent extends CustomEvent {
  currentTarget: EventTarget & { value: string };
  target: EventTarget & { value: string };
}

interface LootDropdownMenuSelectEvent extends CustomEvent {
  detail: { item: Element };
}

interface OpenReadmeEvent extends CustomEvent {
  detail: { relativeFilePath?: string };
}

interface IronOverlayClosedEvent extends CustomEvent {
  target: EventTarget & Element;
  detail: { confirmed: boolean };
}

interface LootPluginEditorOpenEvent extends CustomEvent {
  target: EventTarget & { data: Plugin };
}

interface LootPluginEditorCloseEvent extends CustomEvent {
  target: EventTarget & LootPluginEditor;
}

interface LootCopyMetadataEvent extends CustomEvent {
  target: EventTarget & LootPluginCard;
}

interface LootClearMetadataEvent extends CustomEvent {
  target: EventTarget & LootPluginCard;
}

interface LootSearchBeginEvent extends CustomEvent {
  target: EventTarget & LootSearchToolbar;
}

interface LootGameFolderChangeEvent extends CustomEvent {
  detail: { folder: string };
}

export function onSidebarFilterToggle(evt: PaperCheckboxChangeEvent): void {
  window.loot.filters[evt.target.id] = evt.target.checked;

  const filter = {
    name: evt.target.id,
    state: evt.target.checked
  };
  query('saveFilterState', { filter }).catch(handlePromiseError);
  window.loot.filters.apply(window.loot.game.plugins);
}

export function onContentFilter(evt: PaperInputChangeEvent): void {
  window.loot.filters.contentSearchString = evt.target.value;
  window.loot.filters.apply(window.loot.game.plugins);
}

export function onConflictsFilter(evt: LootDropdownMenuChangeEvent): void {
  /* evt.currentTarget.value is the name of the target plugin, or an empty string
     if the filter has been deactivated. */
  if (evt.currentTarget.value) {
    /* Now get conflicts for the plugin. */
    showProgress(
      window.loot.l10n.translate('Identifying conflicting plugins...')
    );
    window.loot.filters
      .activateConflictsFilter(evt.currentTarget.value)
      .then(response => {
        window.loot.game.generalMessages = response.generalMessages;
        window.loot.game.plugins = window.loot.game.plugins.reduce(
          (plugins, plugin) => {
            const responsePlugin = response.plugins.find(
              item => item.name === plugin.name
            );
            if (responsePlugin) {
              plugin.update(responsePlugin);
              plugins.push(plugin);
            }
            return plugins;
          },
          []
        );

        window.loot.filters.apply(window.loot.game.plugins);

        /* Scroll to the target plugin */
        const list = document.getElementById(
          'pluginCardList'
        ) as IronListElement;
        const index = list.items.findIndex(
          item => item.name === evt.target.value
        );
        list.scrollToIndex(index);

        closeProgress();
      })
      .catch(handlePromiseError);
  } else {
    window.loot.filters.deactivateConflictsFilter();
    window.loot.filters.apply(window.loot.game.plugins);
  }
}

export function onChangeGame(evt: LootDropdownMenuSelectEvent): void {
  if (
    !window.loot.game ||
    evt.detail.item.getAttribute('value') === window.loot.game.folder
  ) {
    // window.loot.game is undefined if LOOT is being initalised.
    return;
  }
  /* Send off a CEF query with the folder name of the new game. */
  query('changeGame', { gameFolder: evt.detail.item.getAttribute('value') })
    .then(JSON.parse)
    .then((result: GameData) => {
      /* Filters should be re-applied on game change, except the conflicts
       filter. Don't need to deactivate the others beforehand. Strictly not
       deactivating the conflicts filter either, just resetting it's value.
       */
      window.loot.filters.deactivateConflictsFilter();

      /* Clear the UI of all existing game-specific data. Also
       clear the card and li variables for each plugin object. */
      const generalMessages = document
        .getElementById('summary')
        .getElementsByTagName('ul')[0];
      while (generalMessages.firstElementChild) {
        generalMessages.removeChild(generalMessages.firstElementChild);
      }

      window.loot.game = new Game(result, window.loot.l10n);
      window.loot.game.initialiseUI(window.loot.filters);

      closeProgress();
    })
    .catch(handlePromiseError);
}

/* Masterlist update process, minus progress dialog. */
function updateMasterlist(): Promise<void> {
  showProgress(
    window.loot.l10n.translate('Updating and parsing masterlist...')
  );
  return query('updateMasterlist')
    .then(JSON.parse)
    .then((result: GameData) => {
      if (result) {
        /* Update JS variables. */
        window.loot.game.masterlist = result.masterlist;
        window.loot.game.generalMessages = result.generalMessages;
        window.loot.game.setGroups(result.groups);

        /* Update Bash Tag autocomplete suggestions. */
        initialiseAutocompleteBashTags(result.bashTags);

        result.plugins.forEach(resultPlugin => {
          const existingPlugin = window.loot.game.plugins.find(
            plugin => plugin.name === resultPlugin.name
          );
          if (existingPlugin) {
            existingPlugin.update(resultPlugin);
          }
        });

        showNotification(
          window.loot.l10n.translateFormatted(
            'Masterlist updated to revision %s.',
            window.loot.game.masterlist.revision
          )
        );
      } else {
        showNotification(
          window.loot.l10n.translate('No masterlist update was necessary.')
        );
      }
    })
    .catch(handlePromiseError);
}
export function onUpdateMasterlist(): void {
  updateMasterlist()
    .then(() => {
      closeProgress();
    })
    .catch(handlePromiseError);
}

export function onSortPlugins(): Promise<void> {
  if (window.loot.filters.deactivateConflictsFilter()) {
    /* Conflicts filter was undone, update the displayed cards. */
    window.loot.filters.apply(window.loot.game.plugins);
  }

  let promise = Promise.resolve();
  if (window.loot.settings.updateMasterlist) {
    promise = promise.then(updateMasterlist);
  }
  return promise
    .then(() => query('sortPlugins'))
    .then(JSON.parse)
    .then((result: MainContent) => {
      if (!result) {
        return;
      }

      window.loot.game.generalMessages = result.generalMessages;

      if (!result.plugins || result.plugins.length === 0) {
        const message = result.generalMessages.find(item =>
          item.text.startsWith(
            window.loot.l10n.translate('Cyclic interaction detected')
          )
        );
        const text = message
          ? marked(message.text)
          : 'see general messages for details.';
        throw new Error(
          window.loot.l10n.translateFormatted(
            'Failed to sort plugins. Details: %s',
            text
          )
        );
      }

      /* Check if sorted load order differs from current load order. */
      const loadOrderIsUnchanged = result.plugins.every(
        (plugin, index) =>
          window.loot.game.plugins[index] &&
          plugin.name === window.loot.game.plugins[index].name
      );
      if (loadOrderIsUnchanged) {
        result.plugins.forEach(plugin => {
          const existingPlugin = window.loot.game.plugins.find(
            item => item.name === plugin.name
          );
          if (existingPlugin) {
            existingPlugin.update(plugin);
          }
        });
        /* Send discardUnappliedChanges query. Not doing so prevents LOOT's window
         from closing. */
        query('discardUnappliedChanges');
        closeProgress();
        showNotification(
          window.loot.l10n.translate(
            'Sorting made no changes to the load order.'
          )
        );
        return;
      }
      window.loot.game.setSortedPlugins(result.plugins);

      /* Now update the UI for the new order. */
      window.loot.filters.apply(window.loot.game.plugins);

      window.loot.state.enterSortingState();

      closeProgress();
    })
    .catch(handlePromiseError);
}

export function onApplySort(): Promise<void> {
  const pluginNames = window.loot.game.getPluginNames();
  return query('applySort', { pluginNames })
    .then(() => {
      window.loot.game.applySort();

      window.loot.state.exitSortingState();
    })
    .catch(handlePromiseError);
}

export function onCancelSort(): Promise<void> {
  return query('cancelSort')
    .then(JSON.parse)
    .then((response: MainContent) => {
      window.loot.game.cancelSort(response.plugins, response.generalMessages);
      /* Sort UI elements again according to stored old load order. */
      window.loot.filters.apply(window.loot.game.plugins);

      window.loot.state.exitSortingState();
    })
    .catch(handlePromiseError);
}

export function onRedatePlugins(/* evt */): void {
  askQuestion(
    window.loot.l10n.translate('Redate Plugins?'),
    window.loot.l10n.translate(
      'This feature is provided so that modders using the Creation Kit may set the load order it uses. A side-effect is that any subscribed Steam Workshop mods will be re-downloaded by Steam (this does not affect Skyrim Special Edition). Do you wish to continue?'
    ),
    window.loot.l10n.translate('Redate'),
    result => {
      if (result) {
        query('redatePlugins')
          .then(() => {
            showNotification(
              window.loot.l10n.translate('Plugins were successfully redated.')
            );
          })
          .catch(handlePromiseError);
      }
    }
  );
}

export function onClearAllMetadata(): void {
  askQuestion(
    '',
    window.loot.l10n.translate(
      'Are you sure you want to clear all existing user-added metadata from all plugins?'
    ),
    window.loot.l10n.translate('Clear'),
    result => {
      if (!result) {
        return;
      }
      query('clearAllMetadata')
        .then(JSON.parse)
        .then((response: ClearAllMetadataResponse) => {
          if (!response || !response.plugins) {
            return;
          }

          window.loot.game.clearMetadata(response.plugins);

          showNotification(
            window.loot.l10n.translate(
              'All user-added metadata has been cleared.'
            )
          );
        })
        .catch(handlePromiseError);
    }
  );
}

export function onCopyContent(): void {
  let content: GameContent = {
    messages: [],
    plugins: []
  };

  if (window.loot.game) {
    content = window.loot.game.getContent();
  } else {
    const message = document
      .getElementById('summary')
      .getElementsByTagName('ul')[0].firstElementChild;

    const { language = 'en' } = window.loot.settings || {};

    if (message) {
      content.messages.push({
        type: message.className,
        text: message.textContent,
        language,
        condition: ''
      });
    }
  }

  query('copyContent', { content })
    .then(() => {
      showNotification(
        window.loot.l10n.translate(
          "LOOT's content has been copied to the clipboard."
        )
      );
    })
    .catch(handlePromiseError);
}

export function onCopyLoadOrder(): void {
  let pluginNames: string[] = [];

  if (window.loot.game && window.loot.game.plugins) {
    pluginNames = window.loot.game.getPluginNames();
  }

  query('copyLoadOrder', { pluginNames })
    .then(() => {
      showNotification(
        window.loot.l10n.translate(
          'The load order has been copied to the clipboard.'
        )
      );
    })
    .catch(handlePromiseError);
}

export function onContentRefresh(): void {
  /* Send a query for updated load order and plugin header info. */
  query('getGameData')
    .then(JSON.parse)
    .then((result: GameData) => {
      window.loot.game = new Game(result, window.loot.l10n);
      window.loot.game.initialiseUI(window.loot.filters);

      closeProgress();
    })
    .catch(handlePromiseError);
}

export function onOpenReadme(evt: OpenReadmeEvent): void {
  const relativeFilePath =
    (evt.detail && evt.detail.relativeFilePath) || 'index.html';

  query('openReadme', { relativeFilePath }).catch(handlePromiseError);
}

export function onOpenLogLocation(): void {
  query('openLogLocation').catch(handlePromiseError);
}

function handleUnappliedChangesClose(change: string): void {
  askQuestion(
    '',
    window.loot.l10n.translateFormatted(
      'You have not yet applied or cancelled your %s. Are you sure you want to quit?',
      change
    ),
    window.loot.l10n.translate('Quit'),
    result => {
      if (!result) {
        return;
      }
      /* Discard any unapplied changes. */
      query('discardUnappliedChanges')
        .then(() => {
          window.close();
        })
        .catch(handlePromiseError);
    }
  );
}

export function onQuit(): void {
  if (window.loot.state.isInSortingState()) {
    handleUnappliedChangesClose(
      window.loot.l10n.translate('sorted load order')
    );
  } else if (window.loot.state.isInEditingState()) {
    handleUnappliedChangesClose(window.loot.l10n.translate('metadata edits'));
  } else {
    window.close();
  }
}

export function onApplySettings(evt: Event): void {
  if (!(document.getElementById('gameTable') as EditableTable).validate()) {
    evt.stopPropagation();
  }
}

export function onCloseSettingsDialog(evt: IronOverlayClosedEvent): void {
  if (evt.target.id !== 'settingsDialog') {
    /* The event can be fired by dropdowns in the settings dialog, so ignore
       any events that don't come from the dialog itself. */
    return;
  }
  if (!evt.detail.confirmed) {
    /* Re-apply the existing settings to the settings dialog elements. */
    updateSettingsDialog(window.loot.settings);
    return;
  }

  /* Update the JS variable values. */
  const settings = {
    enableDebugLogging: (document.getElementById(
      'enableDebugLogging'
    ) as PaperCheckboxElement).checked,
    game: (document.getElementById('defaultGameSelect') as LootDropdownMenu)
      .value,
    games: (document.getElementById('gameTable') as EditableTable).getRowsData(
      false
    ) as GameSettings[],
    language: (document.getElementById('languageSelect') as LootDropdownMenu)
      .value,
    updateMasterlist: (document.getElementById(
      'updateMasterlist'
    ) as PaperCheckboxElement).checked,
    enableLootUpdateCheck: (document.getElementById(
      'enableLootUpdateCheck'
    ) as PaperCheckboxElement).checked,
    filters: window.loot.settings.filters,
    lastVersion: window.loot.settings.lastVersion,
    languages: window.loot.settings.languages
  };

  /* Send the settings back to the C++ side. */
  query('closeSettings', { settings })
    .then(JSON.parse)
    .then((response: GetInstalledGamesResponse) => {
      window.loot.installedGames = response.installedGames;
      if (window.loot.installedGames.length > 0) {
        enableGameOperations(true);
      }
    })
    .catch(handlePromiseError)
    .then(() => {
      window.loot.settings = settings;
      updateSettingsDialog(window.loot.settings);
      setGameMenuItems(window.loot.settings.games, window.loot.installedGames);
      updateSelectedGame(window.loot.game.folder);
    })
    .then(() => {
      if (
        window.loot.installedGames.length > 0 &&
        window.loot.game.folder.length === 0
      ) {
        /* Initialisation failed and game was configured in settings. */
        onContentRefresh();
      }
    })
    .catch(handlePromiseError);
}

export function onSaveUserGroups(evt: IronOverlayClosedEvent): void {
  if (evt.target.id !== 'groupsEditorDialog') {
    /* The event can be fired by dropdowns in the settings dialog, so ignore
       any events that don't come from the dialog itself. */
    return;
  }
  const editor = document.getElementById('groupsEditor') as LootGroupsEditor;
  if (!evt.detail.confirmed) {
    /* Re-apply the existing groups to the editor. */
    editor.setGroups(window.loot.game.groups);
    return;
  }

  /* Send the settings back to the C++ side. */
  const userGroups = editor.getUserGroups();
  query('saveUserGroups', { userGroups })
    .then(JSON.parse)
    .then((response: GameGroups) => {
      window.loot.game.setGroups(response);
      fillGroupsList(window.loot.game.groups);
      editor.setGroups(window.loot.game.groups);
    })
    .catch(handlePromiseError);
}

export function onEditorOpen(
  evt: LootPluginEditorOpenEvent
): Promise<string | void> {
  /* Set the editor data. */
  (document.getElementById('editor') as LootPluginEditor).setEditorData(
    evt.target.data
  );

  window.loot.state.enterEditingState();

  /* Sidebar items have been resized. */
  (document.getElementById('cardsNav') as IronListElement).notifyResize();

  /* Update the plugin's editor state tracker */
  evt.target.data.isEditorOpen = true;

  /* Set up drag 'n' drop event handlers. */
  const elements = document
    .getElementById('cardsNav')
    .getElementsByTagName('loot-plugin-item');
  for (let i = 0; i < elements.length; i += 1) {
    const element = elements[i] as LootPluginItem;
    element.draggable = true;
    element.addEventListener('dragstart', element.onDragStart);
  }

  return query('editorOpened').catch(handlePromiseError);
}

export function onEditorClose(evt: LootPluginEditorCloseEvent): void {
  const plugin = window.loot.game.plugins.find(
    item => item.name === evt.target.querySelector('h1').textContent
  );
  /* Update the plugin's editor state tracker */
  plugin.isEditorOpen = false;

  /* evt.detail is true if the apply button was pressed. */
  const metadata = evt.target.readFromEditor();
  const editorState = {
    applyEdits: evt.detail,
    metadata
  };

  query('editorClosed', { editorState })
    .then(JSON.parse)
    .then((result: DerivedPluginMetadata) => {
      plugin.update(result);

      /* Now perform search again. If there is no current search, this won't
       do anything. */
      (document.getElementById('searchBar') as LootSearchToolbar).search();
    })
    .catch(handlePromiseError)
    .then(() => {
      window.loot.state.exitEditingState();
      /* Sidebar items have been resized. */
      (document.getElementById('cardsNav') as IronListElement).notifyResize();

      /* Remove drag 'n' drop event handlers. */
      const elements = document
        .getElementById('cardsNav')
        .getElementsByTagName('loot-plugin-item');
      for (let i = 0; i < elements.length; i += 1) {
        const element = elements[i] as LootPluginItem;
        element.removeAttribute('draggable');
        element.removeEventListener('dragstart', element.onDragStart);
      }
    })
    .catch(handlePromiseError);
}

export function onCopyMetadata(evt: LootCopyMetadataEvent): void {
  query('copyMetadata', { pluginName: evt.target.getName() })
    .then(() => {
      showNotification(
        window.loot.l10n.translateFormatted(
          'The metadata for "%s" has been copied to the clipboard.',
          evt.target.getName()
        )
      );
    })
    .catch(handlePromiseError);
}

export function onClearMetadata(evt: LootClearMetadataEvent): void {
  askQuestion(
    '',
    window.loot.l10n.translateFormatted(
      'Are you sure you want to clear all existing user-added metadata from "%s"?',
      evt.target.getName()
    ),
    window.loot.l10n.translate('Clear'),
    result => {
      if (!result) {
        return;
      }
      query('clearPluginMetadata', { pluginName: evt.target.getName() })
        .then(JSON.parse)
        .then((plugin: DerivedPluginMetadata) => {
          if (!result) {
            return;
          }
          /* Need to empty the UI-side user metadata. */
          const existingPlugin = window.loot.game.plugins.find(
            item => item.id === evt.target.id
          );
          if (existingPlugin) {
            existingPlugin.update(plugin);
          }
          showNotification(
            window.loot.l10n.translateFormatted(
              'The user-added metadata for "%s" has been cleared.',
              evt.target.getName()
            )
          );
          /* Now perform search again. If there is no current search, this won't do anything. */
          (document.getElementById('searchBar') as LootSearchToolbar).search();
        })
        .catch(handlePromiseError);
    }
  );
}

export function onSearchBegin(evt: LootSearchBeginEvent): void {
  window.loot.game.plugins.forEach(plugin => {
    plugin.isSearchResult = false;
  });

  if (!evt.detail.needle) {
    return;
  }

  evt.target.results = window.loot.game.plugins.reduce(
    (indices, plugin, index) => {
      if (
        plugin
          .getCardContent(window.loot.filters)
          .containsText(evt.detail.needle)
      ) {
        indices.push(index);
        plugin.isSearchResult = true;
      }
      return indices;
    },
    []
  );
}

export function onSearchEnd(/* evt */): void {
  window.loot.game.plugins.forEach(plugin => {
    plugin.isSearchResult = false;
  });
  document.getElementById('mainToolbar').classList.remove('search');
}

export function onFolderChange(evt: LootGameFolderChangeEvent): void {
  updateSelectedGame(evt.detail.folder);
  /* Enable/disable the redate plugins option. */
  let gameSettings;
  if (window.loot.settings && window.loot.settings.games) {
    gameSettings = window.loot.settings.games.find(
      game =>
        (game.type === 'Skyrim' || game.type === 'Skyrim Special Edition') &&
        game.folder === evt.detail.folder
    );
  }
  enable('redatePluginsButton', gameSettings !== undefined);
}