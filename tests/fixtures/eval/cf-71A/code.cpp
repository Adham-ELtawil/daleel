#include <iostream>
#include <string>
using namespace std;
int main() {
    int t; cin >> t;
    while (t--) {
        string word; cin >> word;
        if (word.size() >= 10)
            cout << word.front() << word.size() - 2 << word.back() << '\n';
        else cout << word << '\n';
    }
}
