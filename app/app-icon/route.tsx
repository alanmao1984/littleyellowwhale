export function GET(request: Request) {
  return Response.redirect(new URL('/brand/venus-app-icon-512.png', request.url), 308)
}
