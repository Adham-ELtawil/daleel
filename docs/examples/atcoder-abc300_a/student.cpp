#include <iostream>
using namespace std;
int main() {
    int n, a, b;
    cin >> n >> a >> b;
    for (int i = 0; i < n; ++i) {
        int choice;
        cin >> choice;
        if (choice == a + b) cout << i << '\n';
    }
    return 0;
}
