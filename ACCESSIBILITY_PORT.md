# Accessibility fix for the Tabs + Dropdown Menu nav

## Context

The work project has a `Tabs` navigation component where one or more tabs open an MUI `Menu` dropdown (e.g. "Manage" → edit/delete/transfer). The accessibility tool **evinced** flags issues with this setup, primarily around keyboard tabbing and ARIA.

This document describes the root cause and the changes needed in the existing component files. The approach was prototyped in a separate sandbox and validated with evinced.

Stack:
- Next.js (App Router)
- MUI Material v7
- TypeScript
- React `forwardRef` per-tab pattern, all wrapped by a shared `TabWrapper`

---

## Root cause

The dropdown trigger is currently rendered as an MUI `<Button>` with `role="tab"` and `tabIndex={-1}`, placed as a child of `<Tabs>`. This breaks accessibility for two compounding reasons:

1. **It is not a real `<Tab>`.** MUI's `Tabs` component uses `React.cloneElement` on its children to inject roving-tabindex management, arrow-key navigation, the `selected` flag, and the `onChange` handler. Only actual `<Tab>` children participate in this. A `Button` with `role="tab"` faked on it is invisible to that system.
2. **`tabIndex={-1}` is hardcoded.** Because the fake Tab does not participate in MUI's roving tabindex, the original author hardcoded `tabIndex={-1}` to compensate. The result is that the menu trigger can never receive keyboard focus at all — neither via `Tab` key nor via arrow-key navigation within the tablist.

There are also several smaller ARIA bugs (covered below).

## Fix strategy

Make the dropdown trigger an actual MUI `<Tab>` with `component="button"`. The `<Tab>` is the trigger; the `<Menu>` lives next to it as a sibling. The custom `ButtonWrapper` and the fake `role="tab"` are no longer needed for the dropdown case.

Because the trigger is now a real `<Tab>`, it inherits everything MUI's `Tabs` provides:
- Roving tabindex (one tab in the tablist is focusable; arrow keys move between them)
- `selected` state injection
- Keyboard activation (Enter/Space)
- Focus indicator
- Indicator bar positioning

We add the menu-button keyboard pattern on top:
- Enter / Space (default button behavior) opens the menu
- ArrowDown opens the menu and moves focus to the first menu item
- Escape closes the menu and returns focus to the trigger (MUI `Menu` does this automatically)

---

## Files to change

### File 6 — `TabWrapper`

`TabWrapper` is a direct child of `<Tabs>`, so it must be a `forwardRef` and must spread *all* props it receives down to whichever element actually renders. MUI Tabs injects `selected`, `value`, `onChange`, `tabIndex`, etc. into each direct child via `cloneElement`. Currently those props only reach the `MuiTab` branch; the `ButtonWithMenu` branch silently drops them.

```tsx
// File 6 — TabWrapper.tsx
import { forwardRef, type Ref } from 'react';
import { Tab as MuiTab } from '@mui/material';
import Link from 'next/link';
import ButtonWithMenu from './ButtonWithMenu';

interface TabWrapperProps {
  path?: string;
  text: string;
  type?: string;
  sx?: object;
  // Injected by MUI <Tabs> via cloneElement — declare so TS does not strip them:
  selected?: boolean;
  value?: string | number | false;
  onChange?: (event: React.SyntheticEvent | null, value: number | string) => void;
}

const TabWrapper = forwardRef<HTMLElement, TabWrapperProps>(
  function TabWrapper({ path, text, type, sx, ...rest }, ref) {
    if (!type && path) {
      return (
        <MuiTab
          {...rest}
          ref={ref as Ref<HTMLAnchorElement>}
          component={Link}
          href={path}
          label={text}
          sx={sx}
        />
      );
    }

    return (
      <ButtonWithMenu
        {...rest}
        ref={ref as Ref<HTMLButtonElement>}
        text={text}
        type={type!}
        sx={sx}
      />
    );
  },
);

export default TabWrapper;
```

Key changes:
- `forwardRef` with explicit element types
- Spread `{...rest}` onto **both** branches so MUI's injected props reach the actual rendered element
- Use `Link` directly as `component` (MUI v7 + Next.js 13+ supports passing `next/link`'s `Link` without the `as any` cast in most cases; if TS still complains, the cast can stay, but try without first)
- Removed the `onchange` typo

### File 7 — `ButtonWithMenu` (rewritten)

This is the main change. The trigger becomes a real `<Tab>`. The `ButtonWrapper` indirection goes away for the dropdown case.

```tsx
// File 7 — ButtonWithMenu.tsx
import { forwardRef, useId } from 'react';
import { Tab, Menu } from '@mui/material';
import MenuIcon from './MenuIcon';
import MenuItems from './MenuItems';
import useMenu from './useMenu';
import { pathMap } from './pathMap'; // wherever this lives

interface ButtonWithMenuProps {
  text: string;
  type: string;
  sx?: object;
  // Injected by MUI <Tabs>:
  selected?: boolean;
  value?: string | number | false;
  onChange?: (event: React.SyntheticEvent | null, value: number | string) => void;
}

const ButtonWithMenu = forwardRef<HTMLButtonElement, ButtonWithMenuProps>(
  function ButtonWithMenu(
    { onChange, sx = {}, text, type, ...rest },
    ref,
  ) {
    const [anchorEl, open, handleOpen, handleClose] = useMenu();
    const triggerId = useId();
    const menuId = `navigation-menu-${type}`;

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        handleOpen(event);
      }
    };

    return (
      <>
        <Tab
          {...rest}                              // ← receives selected, value, tabIndex, etc. from <Tabs>
          ref={ref}
          component="button"
          type="button"
          id={triggerId}
          label={text}
          icon={<MenuIcon open={open} />}
          iconPosition="end"
          aria-haspopup="menu"
          aria-expanded={open || undefined}
          aria-controls={open ? menuId : undefined}
          onClick={handleOpen}
          onKeyDown={handleKeyDown}
          sx={sx}
        />
        <Menu
          id={menuId}
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          slotProps={{ list: { 'aria-labelledby': triggerId } }}
        >
          <MenuItems
            type={type}
            onClose={() => {
              handleClose();
              onChange?.(null, pathMap.get(type) ?? 0);
            }}
          />
        </Menu>
      </>
    );
  },
);

export default ButtonWithMenu;
```

Why each change matters:

| Change | Why |
|---|---|
| `<Tab component="button">` (replaces `ButtonWrapper`) | The trigger is a real Tab — picks up roving tabindex, focus, and `selected` state from MUI Tabs. |
| Removed `role="tab"` | No longer faked; the real Tab provides the role. |
| Removed `tabIndex={-1}` | MUI manages tabindex automatically. Hardcoding `-1` was the reason the trigger was unreachable by keyboard. |
| `aria-haspopup="menu"` | Was `aria-haspop` (typo) and `'true'`. `"menu"` is the correct, specific value. |
| `aria-expanded={open \|\| undefined}` | Boolean form; ARIA spec recommends present/absent or true/false consistently. |
| `aria-controls={open ? menuId : undefined}` | Only valid while the menu is rendered; remove when closed. |
| `slotProps={{ list: { 'aria-labelledby': triggerId } }}` | Was `aria-labelledby={menuId}` — a menu pointing at *itself*. Now points at the trigger so the menu's accessible name comes from the tab text. |
| `id={triggerId}` via `useId()` | Required so `aria-labelledby` has a target. `useId` keeps it SSR-safe (Next.js). |
| `onKeyDown` handles ArrowDown | Standard menu-button pattern; complements default Enter/Space activation. |
| Spread `{...rest}` onto `Tab` | Forwards `selected`, `value`, MUI's internal tabindex, the `indicator` prop, etc. Without this, the dropdown tab cannot be highlighted as selected. |
| `forwardRef` | MUI Tabs needs to ref each child for focus management. |

### File 8 — `ButtonWrapper`

`ButtonWrapper` is no longer used by the dropdown path. If it is also used elsewhere in the app, leave it; otherwise it can be deleted. Two cleanups regardless:

- Drop `aria-label={\`navigation ${text}\`}` — the button already has visible text content. Adding `aria-label` overrides that text for screen readers and can produce duplicate-sounding labels like "navigation manage manage" depending on context. The visible text is the accessible name.
- Fix the `forwardRed` typo → `ForwardedRef`.

### File 4 — `TabManage`

Two typo fixes:

```tsx
// File 4 — TabManage.tsx
import { forwardRef } from 'react';
import TabWrapper from './TabWrapper';
import { allHidden } from './permissions'; // existing helper

const menuItems = ['edit', 'delete', 'transfer'];

function TabManage(props, ref) {
  const hidden = allHidden(menuItems); // was 'allHiden'

  if (hidden) return null;

  return (
    <TabWrapper
      {...props}                  // was '{..props}'
      ref={ref}
      type="manage"
      text="manage"
    />
  );
}

export default forwardRef(TabManage); // was 'Tabmanage'
```

Note the existing pattern of returning `null` when the user lacks permission for all menu items: this is fine for MUI Tabs (null children are skipped), but be aware it shifts the *index* of subsequent tabs. If `getTabPosition` in `useTabs` uses hardcoded numeric positions, those positions can drift when permissions hide tabs. See "Caveat" at the end.

### Files 3 / 5 — other tabs

`TabHome` (and any sibling tab files) should already work. Make sure they all:
- Use `forwardRef` correctly
- Spread `{...props}` onto `TabWrapper` so MUI Tabs' injected props reach it
- Have correct typing

Example:

```tsx
// File 3 — TabHome.tsx
import { forwardRef } from 'react';
import TabWrapper from './TabWrapper';

function TabHome(props, ref) {
  return <TabWrapper {...props} ref={ref} path="/home" text="home" />;
}

export default forwardRef(TabHome);
```

---

## Caveat: tab "selected" behavior when the menu opens

With the trigger now being a real `<Tab>`, clicking it will fire `onChange(event, value)` from the MUI Tabs context. In your current `useTabs.onChange` (`(_event, newValue) => setValue(newValue)`), this means clicking the menu tab will move the selection indicator to it immediately, even if the user closes the menu without picking an item.

In some apps that is the desired UX (the indicator confirms which menu the user opened). If you do **not** want that — i.e. you want the indicator to stay on the previously-selected page until the user actually navigates — give each menu tab a string `value` and filter it out in `useTabs.onChange`:

```tsx
// On the menu Tab:
<Tab {...rest} value={`menu:${type}`} ... />

// In useTabs.onChange:
const onChange = useCallback((_event, newValue) => {
  if (typeof newValue === 'string' && newValue.startsWith('menu:')) return;
  setValue(newValue);
}, []);
```

The existing `MenuItems` `onClose` callback continues to call `onChange(null, pathMap.get(type) ?? 0)` after a real selection, so the indicator updates correctly when the user actually picks an item — and the existing `useEffect` on `pathname` keeps the indicator in sync after navigation completes.

If you adopt the string-value approach, `getTabPosition` should return the matching string when the user is on a sub-page of that menu, e.g.:

```tsx
const getTabPosition = (pathname: string) => {
  if (pathname.startsWith('/manage')) return 'menu:manage';
  if (pathname.startsWith('/register')) return 1;
  return 0;
};
```

---

## Expected evinced improvements

After these changes, the following classes of finding should clear:

- "Element has no keyboard access" / "tabindex makes element unfocusable" on the menu trigger — fixed by removing the hardcoded `tabIndex={-1}` and using a real `<Tab>` that participates in MUI's roving tabindex.
- Invalid ARIA attribute `aria-haspop` — fixed (typo → `aria-haspopup="menu"`).
- `aria-labelledby` references an element that does not exist or is not labelling — fixed (now points at the trigger's `useId`-generated id).
- Tabbing through the navigation should now traverse Home → Register → Manage(menu trigger) → … in order; arrow keys should move between tabs within the tablist; Enter/Space/ArrowDown opens the menu; Escape closes it and returns focus to the trigger.

## Validation checklist

1. Tab key from outside the nav lands on the currently-selected tab (roving tabindex behavior — only one tab in the tablist is focusable from outside).
2. Left/Right arrow keys move focus between tabs, including the dropdown trigger.
3. On the dropdown trigger: Enter, Space, and ArrowDown all open the menu. Focus moves into the menu (first item).
4. Inside the menu: Up/Down arrows navigate items; Enter activates; Escape closes and returns focus to the trigger.
5. Screen reader announces the trigger as "Manage, menu, collapsed/expanded, tab" (wording varies by reader).
6. The menu has an accessible name derived from the trigger's text.
7. After picking a menu item, the page navigates and the parent tab is highlighted.
8. evinced and axe-core report no errors on the navigation region.
