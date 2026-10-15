import { useState } from "react";
import { Dialog, Tabs } from "../../../components/ui";
import type { WhatsAppChat } from "../../../lib/api";
import { useChannels } from "../../operations/hooks";
import { LinkChatForm, ManualContactForm } from "./ContactForms";
import { WhatsAppChatPicker } from "./WhatsAppChatPicker";

type ContactTab = "whatsapp" | "manual";

interface CreateContactDialogProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
}

export function CreateContactDialog({
  open,
  onClose,
  companyId,
}: CreateContactDialogProps) {
  const [tab, setTab] = useState<ContactTab>("whatsapp");
  const [selectedChat, setSelectedChat] = useState<WhatsAppChat | null>(null);
  const channels = useChannels();

  // Usa o primeiro canal WhatsApp disponível
  const channelId = channels.data?.find((c) => c.type === "WHATSAPP")?.id;

  const handleClose = () => {
    setSelectedChat(null);
    setTab("whatsapp");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      size="lg"
      title={selectedChat ? "Vincular contato" : "Novo contato"}
    >
      <div className="space-y-4">
        {!selectedChat && (
          <Tabs<ContactTab>
            idPrefix="contact"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "whatsapp", label: "Vincular WhatsApp" },
              { id: "manual", label: "Criar manualmente" },
            ]}
          />
        )}

        {selectedChat && channelId ? (
          <LinkChatForm
            chat={selectedChat}
            companyId={companyId}
            channelId={channelId}
            onBack={() => setSelectedChat(null)}
            onDone={handleClose}
          />
        ) : tab === "whatsapp" ? (
          <WhatsAppChatPicker
            channelId={channelId}
            onSelect={setSelectedChat}
            onCreateManually={() => setTab("manual")}
          />
        ) : (
          <ManualContactForm
            companyId={companyId}
            onCancel={handleClose}
            onDone={handleClose}
          />
        )}
      </div>
    </Dialog>
  );
}
