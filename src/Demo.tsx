import * as React from 'react';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';

function samePageLinkNavigation(
  event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 || // ignore everything but left-click
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  ) {
    return false;
  }
  return true;
}

interface LinkTabProps {
  label?: string;
  href?: string;
  selected?: boolean;
}

function LinkTab(props: LinkTabProps) {
  return (
    <Tab
      component="a"
      onClick={(event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
        // Routing libraries handle this, you can remove the onClick handle when using them.
        if (samePageLinkNavigation(event)) {
          event.preventDefault();
        }
      }}
      aria-current={props.selected && 'page'}
      {...props}
    />
  );
}

interface MenuTabItem {
  label: string;
  href: string;
}

interface MenuTabProps {
  label: string;
  items: MenuTabItem[];
  onItemSelect?: () => void;
}

const MenuTab = React.forwardRef<HTMLButtonElement, MenuTabProps>(
  function MenuTab({ label, items, onItemSelect, ...other }, ref) {
    const triggerId = React.useId();
    const menuId = React.useId();
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const openMenu = (element: HTMLElement) => {
      setAnchorEl(element);
    };

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      openMenu(event.currentTarget);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openMenu(event.currentTarget);
      }
    };

    const handleClose = () => {
      setAnchorEl(null);
    };

    const handleItemClick = (
      event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
    ) => {
      if (samePageLinkNavigation(event)) {
        event.preventDefault();
      }
      onItemSelect?.();
      handleClose();
    };

    return (
      <>
        <Tab
          ref={ref}
          component="button"
          type="button"
          id={triggerId}
          label={label}
          aria-haspopup="menu"
          aria-expanded={open ? true : undefined}
          aria-controls={open ? menuId : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          {...other}
        />
        <Menu
          id={menuId}
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          slotProps={{
            list: { 'aria-labelledby': triggerId },
          }}
        >
          {items.map((item) => (
            <MenuItem
              key={item.href}
              component="a"
              href={item.href}
              onClick={handleItemClick}
            >
              {item.label}
            </MenuItem>
          ))}
        </Menu>
      </>
    );
  },
);

const MENU_TAB_INDEX = 2;

export default function NavTabs() {
  const [value, setValue] = React.useState(0);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    // The dropdown tab is a menu trigger, not a page — don't update selection.
    if (newValue === MENU_TAB_INDEX) {
      return;
    }
    // event.type can be equal to focus with selectionFollowsFocus.
    if (
      event.type !== 'click' ||
      (event.type === 'click' &&
        samePageLinkNavigation(
          event as React.MouseEvent<HTMLAnchorElement, MouseEvent>,
        ))
    ) {
      setValue(newValue);
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Tabs
        value={value}
        onChange={handleChange}
        aria-label="nav tabs example"
        role="navigation"
      >
        <LinkTab label="Page One" href="/drafts" />
        <LinkTab label="Page Two" href="/trash" />
        <MenuTab
          label="More"
          items={[
            { label: 'Page Four', href: '/page-four' },
            { label: 'Page Five', href: '/page-five' },
          ]}
          onItemSelect={() => setValue(MENU_TAB_INDEX)}
        />
        <LinkTab label="Page Three" href="/spam" />
      </Tabs>
    </Box>
  );
}
