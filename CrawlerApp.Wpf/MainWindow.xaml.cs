using System.Windows;
using System.Windows.Controls;

namespace CrawlerApp.Wpf;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private void CopyUrlFromTextBlock(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (sender is TextBlock textBlock && !string.IsNullOrWhiteSpace(textBlock.Text))
        {
            Clipboard.SetText(textBlock.Text);
        }
    }
}
