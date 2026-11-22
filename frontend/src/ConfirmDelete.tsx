import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

interface Props {
  title: string;
  message: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDelete({ title, message, busy, error, onCancel, onConfirm }: Props) {
  return (
    <Dialog open onClose={busy ? undefined : onCancel} aria-labelledby="delete-dialog-title">
      <DialogTitle id="delete-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onCancel} autoFocus>キャンセル</Button>
        <Button disabled={busy} onClick={onConfirm} color="error" variant="contained">削除する</Button>
      </DialogActions>
    </Dialog>
  );
}
