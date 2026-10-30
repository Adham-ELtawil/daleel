#include <iostream>
#include <string>
using namespace std;
char normalize(char c) {
    if (c == 'l') return '1';
    if (c == 'o') return '0';
    return c;
}
int main() {
    int n; string s, t;
    cin >> n >> s >> t;
    bool similar = true;
    for (int i = 0; i < n; ++i) similar &= normalize(s[i]) == normalize(t[i]);
    cout << (similar ? "YES" : "NO") << '\n';
}
