import styled, { createGlobalStyle } from 'styled-components';

const GlobalStyle = createGlobalStyle`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    width: 400px;
    min-height: 100%;
    overflow-x: hidden;
    background: transparent;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    box-sizing: border-box;
  }

  body {
    overflow-y: auto;
    padding: 0 8px;
  }

  #root {
    min-height: 100%;
  }
`;

const Layout = styled.div`
  width: 100%;
  padding: 24px 20px 28px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: #f5f5f5;
  color: #333333;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const HeaderSurface = styled.div`
  background: linear-gradient(180deg, #64b5f6 0%, #4db6ac 100%);
  border-radius: 24px;
  padding: 22px 24px 20px;
  box-shadow: 0 18px 34px rgba(100, 181, 246, 0.2);
  color: #0f2a2e;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: #ffffff;
`;

const Subtitle = styled.p`
  font-size: 12px;
  margin: 0;
  color: rgba(255, 255, 255, 0.8);
`;

const HeaderMeta = styled.span`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  align-self: flex-end;
  text-align: right;
`;

const Stats = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin: 8px 0 0;
`;

const StatCard = styled.div`
  background: #ffffff;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 10px 24px rgba(51, 77, 92, 0.12);
  color: #2f3a40;
  text-align: center;
`;

const StatValue = styled.span`
  font-size: 20px;
  font-weight: 600;
  color: #4db6ac;
`;

const StatLabel = styled.span`
  font-size: 12px;
  color: #607d8b;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  background: #ffffff;
  padding: 6px;
  border-radius: 999px;
  box-shadow: 0 10px 24px rgba(96, 125, 139, 0.12);
`;

const FilterButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 10px 0;
  border-radius: 999px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  color: ${({ $active }) => ($active ? '#ffffff' : '#607d8b')};
  background: ${({ $active }) =>
    $active ? 'linear-gradient(180deg, #64b5f6 0%, #4db6ac 100%)' : 'transparent'};
  box-shadow: ${({ $active }) =>
    $active ? '0 14px 24px rgba(100, 181, 246, 0.25)' : 'none'};
  transition: color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  cursor: pointer;

  &:hover {
    color: ${({ $active }) => ($active ? '#ffffff' : '#4f6571')};
    background: ${({ $active }) =>
      $active ? 'linear-gradient(180deg, #5aa5e5 0%, #45a69e 100%)' : 'rgba(79, 101, 113, 0.08)'};
  }
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #d8dee6;
  background-color: #ffffff;
  color: #333333;
  margin-bottom: 12px;
  box-shadow: 0 6px 18px rgba(96, 125, 139, 0.1);

  &::placeholder {
    color: #7a8a92;
  }
`;

const ContentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const EmptyState = styled.div`
  text-align: center;
  color: rgba(96, 125, 139, 0.7);
  font-size: 13px;
  margin: 40px 0;
`;

const Card = styled.div`
  background: #ffffff;
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 14px 30px rgba(51, 77, 92, 0.14);
  color: #2f3a40;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const CardTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #2f3a40;
`;

const EpisodeName = styled.span`
  color: #607d8b;
  font-size: 12px;
`;

const EpisodeBadge = styled.span`
  background: #ddeef0;
  color: #4db6ac;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
`;

const PlatformLabel = styled.div`
  font-size: 12px;
  color: #607d8b;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: #dce4de;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $percent: number }>`
  height: 100%;
  background: linear-gradient(90deg, #81c784 0%, #4db6ac 100%);
  width: ${({ $percent }) => `${$percent}%`};
`;

const MetaRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #607d8b;
`;

const ActionsRow = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button`
  flex: 1;
  padding: 10px 0;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  background: linear-gradient(180deg, #64b5f6 0%, #4db6ac 100%);
  color: #ffffff;
  box-shadow: 0 10px 18px rgba(79, 195, 196, 0.28);
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-1px);
  }
`;

const DeleteButton = styled(ActionButton)`
  background: linear-gradient(180deg, #ef9a9a 0%, #e57373 100%);
  color: #ffffff;
  box-shadow: 0 10px 18px rgba(229, 115, 115, 0.25);
`;

const Footer = styled.footer`
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FooterActions = styled.div`
  display: flex;
  gap: 8px;
`;

const SecondaryButton = styled.button`
  flex: 1;
  padding: 10px 0;
  border-radius: 10px;
  border: none;
  background: rgba(144, 202, 249, 0.15);
  color: #607d8b;
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-1px);
  }
`;

const DonateRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: rgba(51, 77, 92, 0.7);
`;

const TertiaryButton = styled.button`
  padding: 8px 14px;
  border-radius: 999px;
  border: none;
  background: #ffffff;
  color: #90caf9;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(144, 202, 249, 0.28);
`;

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 8px 0;
`;

const PaginationInfo = styled.span`
  font-size: 12px;
  color: #607d8b;
`;

const PaginationButton = styled.button<{ disabled?: boolean }>`
  padding: 8px 14px;
  border-radius: 999px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  background: ${({ disabled }) =>
    disabled ? '#d8dee6' : 'linear-gradient(180deg, #64b5f6 0%, #4db6ac 100%)'};
  color: ${({ disabled }) => (disabled ? '#9ba7b0' : '#0f2a2e')};
  box-shadow: ${({ disabled }) => (disabled ? 'none' : '0 10px 22px rgba(100, 181, 246, 0.25)')};
  transition: transform 0.2s ease;

  &:hover {
    transform: ${({ disabled }) => (disabled ? 'none' : 'translateY(-1px)')};
    box-shadow: ${({ disabled }) => (disabled ? 'none' : '0 14px 26px rgba(79, 195, 196, 0.28)')};
  }
`;

export {
  ActionButton,
  ActionsRow,
  Card,
  CardHeader,
  CardTitle,
  ContentList,
  DeleteButton,
  DonateRow,
  EmptyState,
  EpisodeBadge,
  EpisodeName,
  FilterButton,
  FilterRow,
  Footer,
  FooterActions,
  Header,
  HeaderSurface,
  Layout,
  MetaRow,
  PlatformLabel,
  ProgressBar,
  ProgressFill,
  SearchInput,
  SecondaryButton,
  StatCard,
  StatLabel,
  StatValue,
  Stats,
  Subtitle,
  Title,
  TertiaryButton,
  Pagination,
  PaginationButton,
  PaginationInfo,
  HeaderMeta
};

export { GlobalStyle };
