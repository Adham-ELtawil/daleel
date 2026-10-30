#include <cctype>
#include <iostream>
#include <string>
using namespace std;
int main() {
    string word; cin >> word;
    const string vowels = "aeiou";
    for (unsigned char c : word) {
        char lower = static_cast<char>(tolower(c));
        if (vowels.find(lower) == string::npos) cout << '.' << lower;
    }
    cout << '\n';
}
