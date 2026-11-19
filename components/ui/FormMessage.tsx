export default function FormMessage({ message }: { message: string }) {
  return message ? <div className="form-errors" role="alert"><p>{message}</p></div> : null
}
