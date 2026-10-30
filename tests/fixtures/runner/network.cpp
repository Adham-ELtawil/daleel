#include <sys/socket.h>
#include <arpa/inet.h>
#include <cstdio>
int main() {
    int s = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in a{};
    a.sin_family = AF_INET;
    a.sin_port = htons(53);
    inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);
    int result = connect(s, (sockaddr*)&a, sizeof(a));
    puts(result < 0 ? "blocked" : "connected");
    return result < 0 ? 0 : 1;
}
