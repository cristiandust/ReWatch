import styled from 'styled-components';

const Layout = styled.div`
  width: 400px;
  padding: 24px 20px 28px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: linear-gradient(180deg, #7b4bff 0%, #a874ff 100%);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
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

const Stats = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 8px;
`;

const StatCard = styled.div`
  background: #ffffff;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 10px 24px rgba(57, 26, 123, 0.16);
  color: #2b1b5f;
`;

const StatValue = styled.span`
  font-size: 20px;
  font-weight: 600;
  color: #623cea;
`;

const StatLabel = styled.span`
  font-size: 12px;
  color: #7466a5;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
`;

const FilterButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 9px 0;
  border-radius: 999px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  color: ${({ $active }) => ($active ? '#623cea' : 'rgba(255, 255, 255, 0.9)')};
  background-color: ${({ $active }) => ($active ? '#ffffff' : 'rgba(255, 255, 255, 0.18)')};
  transition: transform 0.2s ease;
  cursor: pointer;

  &:hover {
    transform: translateY(-1px);
  }
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: none;
  background-color: #ffffff;
  color: #2b1b5f;
  margin-bottom: 12px;
  box-shadow: 0 8px 20px rgba(57, 26, 123, 0.14);

  &::placeholder {
    color: #8f87b5;
  }
`;

const ContentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 4px;
`;

const EmptyState = styled.div`
  text-align: center;
  color: rgba(255, 255, 255, 0.75);
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
  box-shadow: 0 14px 30px rgba(57, 26, 123, 0.18);
  color: #23154f;
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
  color: #23154f;
`;

const EpisodeName = styled.span`
  color: #655a96;
  font-size: 12px;
`;

const EpisodeBadge = styled.span`
  background: #efe7ff;
  color: #623cea;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
`;

const PlatformLabel = styled.div`
  font-size: 12px;
  color: #6d619b;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: #ede7ff;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $percent: number }>`
  height: 100%;
  background: linear-gradient(90deg, #623cea 0%, #8f67ff 100%);
  width: ${({ $percent }) => `${$percent}%`};
`;

const MetaRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #6d619b;
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
  background: linear-gradient(180deg, #ffd672 0%, #f7a94a 100%);
  color: #3a2767;
  box-shadow: 0 10px 18px rgba(240, 166, 60, 0.3);
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-1px);
  }
`;

const DeleteButton = styled(ActionButton)`
  background: linear-gradient(180deg, #ff6b6b 0%, #f43f3f 100%);
  color: #ffffff;
  box-shadow: 0 10px 18px rgba(244, 63, 63, 0.25);
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
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
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
  color: rgba(255, 255, 255, 0.8);
`;

const TertiaryButton = styled.button`
  padding: 8px 14px;
  border-radius: 999px;
  border: none;
  background: #ffffff;
  color: #623cea;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(98, 60, 234, 0.32);
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
  TertiaryButton
};
